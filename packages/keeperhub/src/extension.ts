import type {
  AgentManifest,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';

import {
  canonicalTransferBody,
  type ChainInput,
  deriveTransferKey,
  ExecutionFailed,
  type ExecutionState,
  ExecutionUnconfirmed,
  isValidCron,
  KeeperHubClient,
  KeeperHubError,
  PreflightFailed,
  type Receipt,
  scheduledTransferWorkflow,
  type SimulationResult,
  type WaitOptions,
  type WorkflowTransactionHash,
} from './client';
import { LandedError } from './errors';
import { ExecutionLog, type StageEntry } from './log';
import {
  describePolicy,
  evaluateTransfer,
  type ExecutionPolicy,
  type NormalizedPolicy,
  normalizePolicy,
  type PolicyDecision,
} from './policy';

export const KEEPERHUB_EXTENSION_URI = 'urn:landed:keeperhub-execution:v1';

export interface KeeperHubExtensionOptions {
  /** A prepared client (tests, custom fetch). Otherwise `apiKey` is required. */
  client?: KeeperHubClient | undefined;
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  policy: ExecutionPolicy;
  /** Wait budget for the receipt. Default 180 s, KeeperHub's poll hint drives the interval. */
  wait?: WaitOptions | undefined;
  logMaxEntries?: number | undefined;
  clock?: (() => Date) | undefined;
  /** Human-readable name shown in the agent card descriptor. */
  label?: string | undefined;
}

export interface TransferIntent {
  /** The caller's stable id for this piece of work. Retrying with the same reference cannot pay twice. */
  reference: string;
  chainId: ChainInput;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string | undefined;
  /** Entrypoint key, for the log. */
  entrypoint?: string | undefined;
}

export interface LandedProof {
  reference: string;
  chainId: string;
  recipientAddress: string;
  amount: string;
  tokenAddress: string | undefined;
  idempotencyKey: string;
  executionId: string;
  transactionHash: string;
  transactionLink: string | undefined;
  sponsored: boolean;
  replayed: boolean;
  receipt: Receipt;
  timeline: StageEntry[];
}

export interface DryRun {
  reference: string;
  decision: PolicyDecision;
  simulation: SimulationResult | undefined;
  idempotencyKey: string;
}

export interface ScheduleIntent extends TransferIntent {
  /** Five-field cron. KeeperHub's scheduler runs the payout on it. */
  cron: string;
  timezone?: string | undefined;
  /** Also run the workflow once right now and wait for its receipt. */
  runNow?: boolean | undefined;
}

export interface ScheduledPayout {
  reference: string;
  workflowId: string;
  name: string;
  cron: string;
  timezone: string | undefined;
  /** False when a workflow for this reference already existed and was reused. */
  created: boolean;
  chainId: string;
  recipientAddress: string;
  amount: string;
  tokenAddress: string | undefined;
  firstRun:
    | {
        executionId: string;
        status: string;
        transactionHashes: WorkflowTransactionHash[];
      }
    | undefined;
  timeline: StageEntry[];
}

export interface KeeperHubCapability {
  uri: string;
  description: string;
  required: false;
  params: Record<string, unknown>;
}

export interface KeeperHubRuntime {
  readonly client: KeeperHubClient;
  readonly policy: NormalizedPolicy;
  readonly log: ExecutionLog;
  /** Policy only. Free, synchronous, no KeeperHub call. */
  check(intent: TransferIntent): PolicyDecision;
  /** Policy + KeeperHub dry run. Nothing is signed or broadcast. */
  dryRun(intent: TransferIntent): Promise<DryRun>;
  /** Policy → simulate → broadcast under a derived key → wait → verified receipt, or throw. */
  transfer(intent: TransferIntent): Promise<LandedProof>;
  /**
   * Author a KeeperHub workflow (Schedule trigger → transfer) so the payout recurs without this agent
   * in the loop. One workflow per reference: a repeat call returns the existing one.
   */
  schedule(intent: ScheduleIntent): Promise<ScheduledPayout>;
  /** KeeperHub's view of an execution this agent started. */
  execution(executionId: string): Promise<ExecutionState>;
  /** The descriptor advertised in the agent card. */
  describe(): KeeperHubCapability;
}

export type KeeperHubExtension = Extension<{ keeperhub: KeeperHubRuntime }>;

/**
 * Lucid extension: `createAgent(meta).use(keeperhub({ apiKey, policy })).use(http())`.
 * Adds `runtime.keeperhub` and a capability descriptor to the agent card.
 */
export function keeperhub(
  options: KeeperHubExtensionOptions
): KeeperHubExtension {
  const client =
    options.client ??
    new KeeperHubClient({
      apiKey: options.apiKey ?? '',
      baseUrl: options.baseUrl,
    });
  const policy = normalizePolicy(options.policy);
  const log = new ExecutionLog({
    maxEntries: options.logMaxEntries,
    clock: options.clock,
  });
  const wait: WaitOptions = options.wait ?? {};
  const label = options.label ?? 'KeeperHub execution';

  const runtime: KeeperHubRuntime = {
    client,
    policy,
    log,

    check(intent) {
      return evaluateTransfer(policy, canonicalTransferBody(intent));
    },

    async dryRun(intent) {
      const reference = requireReference(intent.reference);
      const body = canonicalTransferBody(intent);
      const decision = evaluateTransfer(policy, body);
      const idempotencyKey = await keyFor(reference, body);
      if (!decision.allowed) {
        return { reference, decision, simulation: undefined, idempotencyKey };
      }
      try {
        const simulation = await client.simulateTransfer(body);
        return { reference, decision, simulation, idempotencyKey };
      } catch (error) {
        if (error instanceof PreflightFailed) {
          return {
            reference,
            decision,
            simulation: error.simulation,
            idempotencyKey,
          };
        }
        throw wrapKeeperHubError(error, reference);
      }
    },

    async transfer(intent) {
      const reference = requireReference(intent.reference);
      const body = canonicalTransferBody(intent);
      const record = log.start({
        reference,
        entrypoint: intent.entrypoint,
        chainId: body.chainId,
        recipientAddress: body.recipientAddress,
        amount: body.amount,
        tokenAddress: body.tokenAddress,
      });

      const decision = evaluateTransfer(policy, body);
      if (!decision.allowed) {
        log.push(record, 'policy_denied', {
          rule: decision.rule,
          reason: decision.reason,
        });
        log.finish(record, 'policy_denied', {
          code: 'policy_denied',
          message: decision.reason,
        });
        throw new LandedError('policy_denied', decision.reason, {
          reference,
          details: { rule: decision.rule },
        });
      }
      log.push(record, 'policy_ok');

      const idempotencyKey = await keyFor(reference, body);
      record.idempotencyKey = idempotencyKey;

      try {
        const simulation = await client.simulateTransfer(body);
        log.push(record, 'simulated', {
          gasEstimate: simulation.gasEstimate,
          from: simulation.from,
        });
      } catch (error) {
        if (error instanceof PreflightFailed) {
          log.push(record, 'preflight_failed', {
            code: error.code,
            failureKind: error.failureKind,
            revertReason: error.revertReason,
          });
          log.finish(record, 'preflight_failed', {
            code: 'preflight_failed',
            message: error.message,
          });
          throw new LandedError('preflight_failed', error.message, {
            reference,
            details: {
              code: error.code,
              failureKind: error.failureKind,
              revertReason: error.revertReason,
            },
            cause: error,
          });
        }
        log.finish(record, 'error', {
          code: 'keeperhub_error',
          message: String(error),
        });
        throw wrapKeeperHubError(error, reference);
      }

      log.push(record, 'broadcast', { idempotencyKey });
      let verified;
      try {
        const accepted = await client.executeTransfer(body, { idempotencyKey });
        record.executionId = accepted.executionId;
        record.replayed = accepted.idempotentReplay;
        log.push(record, 'accepted', {
          executionId: accepted.executionId,
          status: accepted.status,
          replayed: accepted.idempotentReplay,
        });
        verified = await client.verify(accepted, wait);
      } catch (error) {
        if (error instanceof ExecutionFailed) {
          record.transactionHash = error.state.transactionHash;
          log.push(record, 'failed', {
            reason: error.reason,
            status: error.state.status,
            receipts: error.state.receipts,
            error: error.state.error,
          });
          log.finish(record, 'failed', {
            code: 'execution_failed',
            message: error.message,
          });
          throw new LandedError('execution_failed', error.message, {
            reference,
            details: {
              reason: error.reason,
              executionId: error.state.executionId,
              transactionHash: error.state.transactionHash,
              receipts: error.state.receipts,
            },
            cause: error,
          });
        }
        if (error instanceof ExecutionUnconfirmed) {
          record.transactionHash = error.state.transactionHash;
          log.push(record, 'unconfirmed', {
            status: error.state.status,
            waitedMs: error.waitedMs,
            transactionHash: error.state.transactionHash,
          });
          log.finish(record, 'unconfirmed', {
            code: 'execution_unconfirmed',
            message: error.message,
          });
          throw new LandedError(
            'execution_unconfirmed',
            `${error.message}. Retry with the same reference, never a new one.`,
            {
              reference,
              details: {
                executionId: error.state.executionId,
                transactionHash: error.state.transactionHash,
                note: 'Outcome unknown. Retry with the same reference; never with a new one.',
              },
              cause: error,
            }
          );
        }
        log.finish(record, 'error', {
          code: 'keeperhub_error',
          message: String(error),
        });
        throw wrapKeeperHubError(error, reference);
      }

      record.transactionHash = verified.transactionHash;
      record.transactionLink = verified.transactionLink;
      record.sponsored = verified.sponsored;
      log.push(record, 'landed', {
        transactionHash: verified.transactionHash,
        blockNumber: verified.receipt.blockNumber,
        receiptStatus: verified.receipt.receiptStatus,
        sponsored: verified.sponsored,
      });
      log.finish(record, 'landed');

      return {
        reference,
        chainId: body.chainId,
        recipientAddress: body.recipientAddress,
        amount: body.amount,
        tokenAddress: body.tokenAddress,
        idempotencyKey,
        executionId: verified.executionId,
        transactionHash: verified.transactionHash,
        transactionLink: verified.transactionLink,
        sponsored: verified.sponsored,
        replayed: verified.replayed,
        receipt: verified.receipt,
        timeline: record.stages,
      };
    },

    async schedule(intent) {
      const reference = requireReference(intent.reference);
      const cron = intent.cron.trim();
      if (!isValidCron(cron)) {
        throw new LandedError(
          'invalid_request',
          `invalid cron expression "${intent.cron}" (five fields, e.g. "0 9 * * 1")`,
          { reference }
        );
      }
      const body = canonicalTransferBody(intent);
      const record = log.start({
        reference,
        entrypoint: intent.entrypoint,
        chainId: body.chainId,
        recipientAddress: body.recipientAddress,
        amount: body.amount,
        tokenAddress: body.tokenAddress,
      });
      const decision = evaluateTransfer(policy, body);
      if (!decision.allowed) {
        log.push(record, 'policy_denied', {
          rule: decision.rule,
          reason: decision.reason,
        });
        log.finish(record, 'policy_denied', {
          code: 'policy_denied',
          message: decision.reason,
        });
        throw new LandedError('policy_denied', decision.reason, {
          reference,
          details: { rule: decision.rule },
        });
      }
      log.push(record, 'policy_ok');

      const name = `landed:${reference}`;
      try {
        const existing = (await client.listWorkflows()).find(
          w => w.name === name
        );
        let workflowId: string;
        let created: boolean;
        if (existing) {
          workflowId = existing.id;
          created = false;
          log.push(record, 'workflow_reused', { workflowId });
        } else {
          const workflow = await client.createWorkflow(
            scheduledTransferWorkflow({
              name,
              description: `Landed recurring payout for reference ${reference}`,
              cron,
              timezone: intent.timezone,
              chainId: body.chainId,
              recipientAddress: body.recipientAddress,
              amount: body.amount,
              tokenAddress: body.tokenAddress,
              enabled: true,
            })
          );
          workflowId = workflow.id;
          created = true;
          log.push(record, 'workflow_created', { workflowId, cron });
        }
        record.executionId = undefined;

        let firstRun: ScheduledPayout['firstRun'];
        if (intent.runNow) {
          const started = await client.executeWorkflow(workflowId);
          const result = await client.waitForWorkflowExecution(
            started.executionId,
            { deadlineMs: wait.maxWaitMs ?? 180_000 }
          );
          record.executionId = result.executionId;
          record.transactionHash = result.transactionHashes[0]?.hash;
          record.transactionLink = result.transactionHashes[0]?.link;
          log.push(record, 'workflow_run', {
            executionId: result.executionId,
            status: result.status,
            completed: result.completed,
            hashes: result.transactionHashes.map(h => h.hash),
          });
          if (!result.completed) {
            log.finish(record, 'unconfirmed', {
              code: 'execution_unconfirmed',
              message: `workflow run ${result.executionId} still ${result.status}`,
            });
            throw new LandedError(
              'execution_unconfirmed',
              `workflow run ${result.executionId} still ${result.status} after the wait budget. Retry with the same reference, never a new one.`,
              {
                reference,
                details: { workflowId, executionId: result.executionId },
              }
            );
          }
          const unverified = result.transactionHashes.filter(
            h =>
              h.verified === false ||
              (h.receiptStatus !== undefined && h.receiptStatus !== 'success')
          );
          if (result.status !== 'success' || unverified.length > 0) {
            log.finish(record, 'failed', {
              code: 'execution_failed',
              message: result.error ?? `workflow run ${result.status}`,
            });
            throw new LandedError(
              'execution_failed',
              `workflow run ${result.executionId} ended ${result.status}${result.error ? `: ${result.error}` : ''}`,
              {
                reference,
                details: {
                  workflowId,
                  executionId: result.executionId,
                  transactionHashes: result.transactionHashes,
                },
              }
            );
          }
          firstRun = {
            executionId: result.executionId,
            status: result.status,
            transactionHashes: result.transactionHashes,
          };
        }

        log.finish(record, firstRun ? 'landed' : 'scheduled');
        return {
          reference,
          workflowId,
          name,
          cron,
          timezone: intent.timezone,
          created,
          chainId: body.chainId,
          recipientAddress: body.recipientAddress,
          amount: body.amount,
          tokenAddress: body.tokenAddress,
          firstRun,
          timeline: record.stages,
        };
      } catch (error) {
        if (error instanceof LandedError) {
          throw error;
        }
        log.finish(record, 'error', {
          code: 'keeperhub_error',
          message: String(error),
        });
        throw wrapKeeperHubError(error, reference);
      }
    },

    execution(executionId) {
      return client.getStatus(executionId);
    },

    describe() {
      return {
        uri: KEEPERHUB_EXTENSION_URI,
        description: `${label}: onchain value movement executes through KeeperHub (simulate, broadcast under a stable idempotency key, verified receipt). Paid entrypoints settle only after the receipt verifies.`,
        required: false,
        params: {
          executionLayer: 'keeperhub',
          keeperhub: client.baseUrl,
          policy: describePolicy(policy),
          idempotency:
            'sha256(reference|chainId|recipient|amount|token) shared with KeeperHub; same reference never pays twice',
          proof: [
            'executionId',
            'transactionHash',
            'transactionLink',
            'receipt.verified',
            'receipt.receiptStatus',
          ],
          settlement:
            "payment finalizes only on receipt.verified === true && receiptStatus === 'success'",
        },
      };
    },
  };

  return {
    name: 'keeperhub',
    build(_ctx: BuildContext) {
      return { keeperhub: runtime };
    },
    onManifestBuild(card: AgentManifest): AgentManifest {
      const capabilities = card.capabilities ?? {};
      const existing = Array.isArray(capabilities.extensions)
        ? capabilities.extensions
        : [];
      const descriptor: Record<string, unknown> = { ...runtime.describe() };
      const extensions = [
        ...existing.filter(e => !(isRecord(e) && e.uri === descriptor.uri)),
        descriptor,
      ];
      return { ...card, capabilities: { ...capabilities, extensions } };
    },
  };
}

function keyFor(
  reference: string,
  body: ReturnType<typeof canonicalTransferBody>
): Promise<string> {
  return deriveTransferKey({
    taskId: reference,
    chainId: body.chainId,
    recipientAddress: body.recipientAddress,
    amount: body.amount,
    tokenAddress: body.tokenAddress,
  });
}

function requireReference(reference: string): string {
  const trimmed = typeof reference === 'string' ? reference.trim() : '';
  if (!trimmed) {
    throw new LandedError(
      'invalid_request',
      "reference is required: the caller's stable id for this payment (invoice, task, period)"
    );
  }
  return trimmed;
}

function wrapKeeperHubError(error: unknown, reference: string): LandedError {
  if (error instanceof LandedError) {
    return error;
  }
  if (error instanceof KeeperHubError) {
    return new LandedError('keeperhub_error', error.message, {
      reference,
      details: {
        status: error.status,
        code: error.code,
        requestId: error.requestId,
        retryable: error.retryable,
      },
      cause: error,
    });
  }
  return new LandedError(
    'keeperhub_error',
    error instanceof Error ? error.message : String(error),
    { reference, cause: error }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
