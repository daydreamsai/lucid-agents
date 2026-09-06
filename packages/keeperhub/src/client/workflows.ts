import {
  canonicalAmount,
  canonicalChainId,
  normalizeAddress,
} from './idempotency';
import type { ChainInput, WorkflowDefinition } from './types';

export interface ScheduledTransferWorkflowInput {
  name: string;
  description?: string | undefined;
  /** Five-field cron, e.g. "0 9 * * 1" (Mondays 09:00). */
  cron: string;
  /** IANA timezone, e.g. "UTC". */
  timezone?: string | undefined;
  chainId: ChainInput;
  recipientAddress: string;
  amount: string;
  /** ERC-20 contract; omit for the native asset. */
  tokenAddress?: string | undefined;
  enabled?: boolean | undefined;
  /** Sender routing: "default" (org policy), "eoa", or "safe:<id>". */
  web3Connection?: string | undefined;
}

const CRON_FIELD = String.raw`(\*|[0-9*/,-]+|[A-Za-z]{3}(-[A-Za-z]{3})?)`;
const CRON_RE = new RegExp(`^${CRON_FIELD}(\\s+${CRON_FIELD}){4}$`);

export function isValidCron(cron: string): boolean {
  return CRON_RE.test(cron.trim());
}

/**
 * A two-node KeeperHub workflow: Schedule trigger → token (or native) transfer.
 * Node and config keys follow docs/api/workflows.md and the web3 plugin fields
 * (`network`, `tokenConfig`, `amount`, `recipientAddress`, `web3Connection`).
 */
export function scheduledTransferWorkflow(
  input: ScheduledTransferWorkflowInput
): WorkflowDefinition {
  const cron = input.cron.trim();
  if (!isValidCron(cron)) {
    throw new Error(`invalid cron expression: "${input.cron}"`);
  }
  const network = canonicalChainId(input.chainId);
  const recipientAddress = normalizeAddress(input.recipientAddress);
  const amount = canonicalAmount(input.amount);
  const tokenAddress = input.tokenAddress
    ? normalizeAddress(input.tokenAddress)
    : undefined;

  const triggerConfig: Record<string, unknown> = {
    triggerType: 'Schedule',
    scheduleCron: cron,
  };
  if (input.timezone) {
    triggerConfig.scheduleTimezone = input.timezone;
  }
  const actionConfig: Record<string, unknown> = tokenAddress
    ? {
        actionType: 'web3/transfer-token',
        network,
        tokenConfig: tokenAddress,
        amount,
        recipientAddress,
        web3Connection: input.web3Connection ?? 'default',
      }
    : {
        actionType: 'web3/transfer-funds',
        network,
        amount,
        recipientAddress,
        web3Connection: input.web3Connection ?? 'default',
      };

  const definition: WorkflowDefinition = {
    name: input.name,
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        data: { label: 'Schedule', config: triggerConfig },
      },
      {
        id: 'payout',
        type: 'action',
        data: {
          label: tokenAddress ? 'Transfer token' : 'Transfer native',
          config: actionConfig,
        },
      },
    ],
    edges: [{ id: 'trigger->payout', source: 'trigger', target: 'payout' }],
  };
  if (input.description !== undefined) {
    definition.description = input.description;
  }
  if (input.enabled !== undefined) {
    definition.enabled = input.enabled;
  }
  return definition;
}
