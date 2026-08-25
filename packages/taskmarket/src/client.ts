import {
  BASE_NETWORK_NAME,
  DEFAULT_TASKMARKET_API_URL,
  DEFAULT_TASKMARKET_APP_URL,
  USER_AGENT,
} from './constants';
import {
  PaymentInFlightError,
  PaymentSettlementUnknownError,
  TaskmarketError,
} from './errors';
import { readSignatureHeaders } from './auth';
import {
  createInMemoryPaymentAttemptStore,
  isBlockingAttempt,
} from './attempts';
import { parsePaymentRequired, selectSafeOffer } from './payment-required';
import {
  assertAuthorized,
  assertPreviewIntegrity,
  previewAcceptSubmission,
  previewCreateTask,
  previewRejectSubmission,
} from './preview';
import type {
  CreateTaskDraft,
  CreateTaskResult,
  ExplicitAuthorization,
  IntentStatus,
  PaymentAttempt,
  SubmissionView,
  TaskLink,
  TaskPreview,
  TaskStatusView,
  TaskmarketAccount,
  TaskmarketClientOptions,
  TaskmarketRuntime,
} from './types';
import { signExactEvmPayment } from './x402-exact';

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function taskLinks(
  taskId: string,
  apiUrl: string,
  appUrl: string,
  referenceCode?: string | null
): TaskLink {
  const api = apiUrl.replace(/\/$/, '');
  const app = appUrl.replace(/\/$/, '');
  return {
    taskId,
    referenceCode: referenceCode ?? null,
    apiUrl: `${api}/api/tasks/${taskId}`,
    appUrl: `${app}/tasks/${taskId}`,
  };
}

function mapSubmission(raw: unknown): SubmissionView {
  const row = asRecord(raw);
  const artifacts = Array.isArray(row.artifacts) ? row.artifacts : [];
  const artifactNames = artifacts.map(item => {
    const art = asRecord(item);
    return String(art.fileName ?? art.role ?? art.id ?? 'artifact');
  });
  return {
    id: String(row.id ?? ''),
    workerAddress: String(row.workerAddress ?? ''),
    submittedAt: (row.submittedAt as string | null) ?? null,
    rejectedAt: (row.rejectedAt as string | null) ?? null,
    fileUrl: (row.fileUrl as string | null) ?? null,
    artifactNames,
  };
}

function toIntent(raw: unknown, fallbackKey: string): IntentStatus {
  const row = asRecord(raw);
  return {
    intentId: String(row.intentId ?? ''),
    idempotencyKey: String(row.idempotencyKey ?? fallbackKey),
    operation: String(row.operation ?? ''),
    status: String(row.status ?? ''),
    txHash: (row.txHash as string | null) ?? null,
    terminalReason: (row.terminalReason as string | null) ?? null,
    taskId: (row.taskId as string | null) ?? null,
  };
}

export class TaskmarketClient implements TaskmarketRuntime {
  private readonly account: TaskmarketAccount;
  private readonly apiUrl: string;
  private readonly appUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly randomUUID: () => string;
  private readonly attempts;
  private readonly legalReceipt?: string;
  private readonly logger;

  constructor(options: TaskmarketClientOptions) {
    if (!options.account?.address) {
      throw new TaskmarketError(
        'missing_account',
        'A wallet account is required; this toolkit never creates or stores keys'
      );
    }
    this.account = options.account;
    this.apiUrl = (options.apiUrl ?? DEFAULT_TASKMARKET_API_URL).replace(
      /\/$/,
      ''
    );
    this.appUrl = (options.appUrl ?? DEFAULT_TASKMARKET_APP_URL).replace(
      /\/$/,
      ''
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
    this.attempts = options.attempts ?? createInMemoryPaymentAttemptStore();
    this.legalReceipt = options.legalReceipt;
    this.logger = options.logger ?? {};
  }

  previewCreate(draft: CreateTaskDraft): TaskPreview {
    return previewCreateTask(draft, {
      now: this.now,
      randomUUID: this.randomUUID,
    });
  }

  previewAccept(input: {
    taskId: string;
    workerAddress: string;
    shareBps?: number;
  }): TaskPreview {
    return previewAcceptSubmission(input, {
      now: this.now,
      randomUUID: this.randomUUID,
    });
  }

  previewReject(input: { taskId: string; workerAddress: string }): TaskPreview {
    return previewRejectSubmission(input, {
      now: this.now,
      randomUUID: this.randomUUID,
    });
  }

  async createTask(
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ): Promise<CreateTaskResult> {
    assertPreviewIntegrity(preview);
    assertAuthorized(preview, authorization);
    if (preview.operation !== 'create') {
      throw new TaskmarketError('invalid_preview', 'Preview is not a create');
    }
    const body = {
      description: preview.description,
      reward: preview.rewardBaseUnits,
      duration: preview.durationHours,
      tags: preview.tags,
      mode: preview.mode,
    };
    const paid = await this.paidWrite({
      preview,
      path: '/api/tasks',
      body,
      operation: 'create',
    });
    const taskId = String(paid.taskId ?? '');
    if (!taskId) {
      throw new TaskmarketError(
        'missing_task_id',
        'Taskmarket did not return a taskId after payment'
      );
    }
    return {
      ...taskLinks(
        taskId,
        this.apiUrl,
        this.appUrl,
        paid.referenceCode as string | undefined
      ),
      intentId: (paid.intentId as string | null) ?? null,
      idempotencyKey: preview.idempotencyKey,
    };
  }

  async getTask(taskId: string): Promise<TaskStatusView> {
    const payload = await this.getJson(`/api/tasks/${taskId}`);
    const row = asRecord(payload);
    const id = String(row.id ?? taskId);
    return {
      ...taskLinks(
        id,
        this.apiUrl,
        this.appUrl,
        row.referenceCode as string | undefined
      ),
      status: String(row.status ?? 'unknown'),
      description: String(row.description ?? ''),
      reward: String(row.reward ?? ''),
      expiryTime: (row.expiryTime as string | null) ?? null,
      submissionCount: (row.submissionCount as number | null) ?? null,
      submissionWindowOpen:
        (row.submissionWindowOpen as boolean | null) ?? null,
      network: BASE_NETWORK_NAME,
    };
  }

  async listSubmissions(taskId: string): Promise<SubmissionView[]> {
    const payload = await this.getJson(`/api/tasks/${taskId}/submissions`);
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload).submissions)
        ? (asRecord(payload).submissions as unknown[])
        : [];
    return items.map(mapSubmission);
  }

  async acceptSubmission(
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ): Promise<IntentStatus> {
    assertPreviewIntegrity(preview);
    assertAuthorized(preview, authorization);
    if (
      preview.operation !== 'accept' ||
      !preview.taskId ||
      !preview.workerAddress
    ) {
      throw new TaskmarketError('invalid_preview', 'Preview is not an accept');
    }
    const paid = await this.paidWrite({
      preview,
      path: `/api/tasks/${preview.taskId}/accept-submissions`,
      body: {
        winners: [
          {
            worker: preview.workerAddress,
            share: preview.shareBps ?? 10_000,
          },
        ],
      },
      operation: 'accept',
    });
    return toIntent(paid, preview.idempotencyKey);
  }

  async rejectSubmission(
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ): Promise<IntentStatus> {
    assertPreviewIntegrity(preview);
    assertAuthorized(preview, authorization);
    if (
      preview.operation !== 'reject' ||
      !preview.taskId ||
      !preview.workerAddress
    ) {
      throw new TaskmarketError('invalid_preview', 'Preview is not a reject');
    }
    const paid = await this.paidWrite({
      preview,
      path: `/api/tasks/${preview.taskId}/reject-submission`,
      body: { worker: preview.workerAddress },
      operation: 'reject',
    });
    return toIntent(paid, preview.idempotencyKey);
  }

  async recoverPayment(idempotencyKey: string): Promise<IntentStatus> {
    const intent = await this.getIntent(idempotencyKey);
    const existing = this.attempts.get(idempotencyKey);
    const completed =
      intent.status === 'completed' || intent.status === 'failed';
    if (existing) {
      this.attempts.set({
        ...existing,
        status: completed
          ? intent.status === 'completed'
            ? 'completed'
            : 'failed'
          : 'unknown',
        intentId: intent.intentId || existing.intentId,
        taskId: intent.taskId ?? existing.taskId,
        updatedAtIso: new Date(this.now()).toISOString(),
      });
    }
    return intent;
  }

  private async getIntent(idempotencyKey: string): Promise<IntentStatus> {
    const payload = await this.getJson(
      `/api/intents?idempotencyKey=${encodeURIComponent(idempotencyKey)}`
    );
    return toIntent(payload, idempotencyKey);
  }

  private async getJson(path: string): Promise<unknown> {
    const auth = await readSignatureHeaders(this.account);
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...auth,
        ...(this.legalReceipt
          ? { 'X-Taskmarket-Legal-Receipt': this.legalReceipt }
          : {}),
      },
    });
    const text = await response.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    if (!response.ok) {
      throw new TaskmarketError(
        'http_error',
        `GET ${path} failed with ${response.status}`
      );
    }
    return parsed;
  }

  private remember(
    preview: TaskPreview,
    operation: string,
    status: PaymentAttempt['status'],
    extra: Partial<PaymentAttempt> = {}
  ): void {
    this.attempts.set({
      idempotencyKey: preview.idempotencyKey,
      operation,
      status,
      expectedAmount: preview.rewardBaseUnits,
      previewId: preview.previewId,
      updatedAtIso: new Date(this.now()).toISOString(),
      ...extra,
    });
  }

  private async paidWrite(args: {
    preview: TaskPreview;
    path: string;
    body: unknown;
    operation: string;
  }): Promise<Json> {
    const existing = this.attempts.get(args.preview.idempotencyKey);
    if (existing?.status === 'completed' && existing.taskId) {
      return { taskId: existing.taskId, intentId: existing.intentId };
    }
    if (isBlockingAttempt(existing)) {
      throw new PaymentInFlightError(args.preview.idempotencyKey);
    }

    const encoded = JSON.stringify(args.body);
    const baseHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'X-Taskmarket-Idempotency-Key': args.preview.idempotencyKey,
      'X-Taskmarket-Caller-Address': this.account.address,
      ...(this.legalReceipt
        ? { 'X-Taskmarket-Legal-Receipt': this.legalReceipt }
        : {}),
    };

    this.logger.info?.('taskmarket probe without payment', {
      operation: args.operation,
      path: args.path,
      amount: args.preview.rewardUsdc,
      network: args.preview.network,
      maxSpend: args.preview.maxSpendUsdc,
    });

    const probe = await this.fetchImpl(`${this.apiUrl}${args.path}`, {
      method: 'POST',
      headers: baseHeaders,
      body: encoded,
    });
    const probeText = await probe.text();
    let probeBody: unknown;
    try {
      probeBody = probeText ? JSON.parse(probeText) : undefined;
    } catch {
      probeBody = undefined;
    }

    if (probe.status === 409) {
      this.logger.warn?.('idempotency key reused; recovering intent', {
        idempotencyKey: args.preview.idempotencyKey,
      });
      return asRecord(await this.recoverPayment(args.preview.idempotencyKey));
    }

    if (probe.ok) {
      const result = asRecord(probeBody);
      this.remember(args.preview, args.operation, 'completed', {
        taskId: result.taskId as string | undefined,
        intentId: result.intentId as string | undefined,
      });
      return result;
    }

    if (probe.status !== 402) {
      throw new TaskmarketError(
        'http_error',
        `POST ${args.path} failed with ${probe.status} before payment`
      );
    }

    const required = parsePaymentRequired(probe, probeBody);
    if (!required) {
      throw new TaskmarketError(
        'missing_payment_requirements',
        '402 response did not include payment requirements'
      );
    }
    const offer = selectSafeOffer(required, {
      amount: args.preview.rewardBaseUnits,
      maxSpendBaseUnits: args.preview.maxSpendBaseUnits,
    });

    const paymentSignature = await signExactEvmPayment({
      account: this.account,
      offer,
      resource: required.resource,
      now: this.now,
    });

    this.remember(args.preview, args.operation, 'in_flight');
    this.logger.info?.('taskmarket sending single payment', {
      operation: args.operation,
      amount: offer.amount,
      network: offer.network,
      asset: offer.asset,
      payTo: offer.payTo,
    });

    let paid: Response;
    try {
      paid = await this.fetchImpl(`${this.apiUrl}${args.path}`, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'PAYMENT-SIGNATURE': paymentSignature,
        },
        body: encoded,
      });
    } catch (error) {
      this.remember(args.preview, args.operation, 'unknown');
      throw new PaymentSettlementUnknownError(
        args.preview.idempotencyKey,
        args.operation,
        error instanceof Error ? error.message : undefined
      );
    }

    const paidText = await paid.text();
    let paidBody: unknown;
    try {
      paidBody = paidText ? JSON.parse(paidText) : undefined;
    } catch {
      paidBody = undefined;
    }

    if (paid.status >= 500 || paid.status === 408 || paid.status === 429) {
      this.remember(args.preview, args.operation, 'unknown');
      throw new PaymentSettlementUnknownError(
        args.preview.idempotencyKey,
        args.operation,
        `HTTP ${paid.status} after payment was sent`
      );
    }

    if (paid.status === 409) {
      this.logger.warn?.('idempotency key reused after payment; recovering', {
        idempotencyKey: args.preview.idempotencyKey,
      });
      return asRecord(await this.recoverPayment(args.preview.idempotencyKey));
    }

    if (paid.status === 402) {
      this.remember(args.preview, args.operation, 'failed');
      throw new TaskmarketError(
        'payment_rejected',
        'Taskmarket rejected the payment challenge; not retrying automatically'
      );
    }

    if (!paid.ok) {
      this.remember(args.preview, args.operation, 'failed');
      throw new TaskmarketError(
        'http_error',
        `POST ${args.path} failed with ${paid.status} after payment`
      );
    }

    const result = asRecord(paidBody);
    this.remember(args.preview, args.operation, 'completed', {
      taskId: result.taskId as string | undefined,
      intentId: result.intentId as string | undefined,
    });
    return result;
  }
}

export function createTaskmarketClient(
  options: TaskmarketClientOptions
): TaskmarketClient {
  return new TaskmarketClient(options);
}
