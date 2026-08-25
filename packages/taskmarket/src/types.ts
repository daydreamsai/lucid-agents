import type { Hex } from 'viem';

import type { BASE_CAIP2, BASE_NETWORK_NAME } from './constants';

export type TaskmarketAccount = {
  address: `0x${string}`;
  signMessage: (args: { message: string }) => Promise<Hex>;
  signTypedData: (args: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<Hex>;
};

export type TaskMode = 'bounty' | 'claim' | 'pitch' | 'benchmark' | 'auction';

export type CreateTaskDraft = {
  description: string;
  /** Human-readable USDC, e.g. 1.5. Mutually exclusive with rewardBaseUnits. */
  rewardUsdc?: number | string;
  /** Integer USDC base units (6 decimals). */
  rewardBaseUnits?: bigint | string;
  /** Duration in hours. */
  durationHours: number;
  tags: string[];
  mode?: TaskMode;
  /** Human-readable deliverables shown in the confirmation preview. */
  deliverables: string;
  /**
   * Hard cap on this create, in USDC base units. Defaults to the reward.
   * The x402 challenge amount must be <= this cap and equal the reward.
   */
  maxSpendBaseUnits?: bigint | string;
};

export type RequesterOperation = 'create' | 'accept' | 'reject';

export type TaskPreview = {
  previewId: string;
  operation: RequesterOperation;
  idempotencyKey: string;
  description: string;
  rewardBaseUnits: string;
  rewardUsdc: string;
  durationHours: number | null;
  deadlineIso: string | null;
  deliverables: string;
  network: typeof BASE_NETWORK_NAME;
  networkCaip2: typeof BASE_CAIP2;
  asset: `0x${string}`;
  assetSymbol: 'USDC';
  maxSpendBaseUnits: string;
  maxSpendUsdc: string;
  mode: TaskMode | null;
  tags: string[];
  createdAtIso: string;
  taskId?: string;
  workerAddress?: string;
  shareBps?: number;
};

export type ExplicitAuthorization = {
  previewId: string;
  /** Must be the boolean true. Any other value is rejected. */
  confirmed: true;
  /** Opaque single-use token issued by confirm() on this client instance. */
  token: string;
};

export type IssuedAuthorization = {
  previewId: string;
  token: string;
  expiresAtMs: number;
  consumed: boolean;
};

export type AuthorizationStore = {
  get: (token: string) => IssuedAuthorization | undefined;
  set: (record: IssuedAuthorization) => void;
};

export type PaymentAttemptStatus =
  | 'reserved'
  | 'in_flight'
  | 'unknown'
  | 'completed'
  | 'failed';

export type PaymentAttempt = {
  idempotencyKey: string;
  operation: string;
  status: PaymentAttemptStatus;
  expectedAmount: string;
  previewId?: string;
  taskId?: string;
  intentId?: string;
  updatedAtIso: string;
};

export type PaymentAttemptStore = {
  get: (idempotencyKey: string) => PaymentAttempt | undefined;
  set: (attempt: PaymentAttempt) => void;
  list: () => PaymentAttempt[];
};

export type X402Accept = {
  scheme?: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: {
    name?: string;
    version?: string;
  };
};

export type PaymentRequired = {
  x402Version?: number;
  accepts?: X402Accept[];
  error?: string;
  resource?: string;
};

export type TaskLink = {
  taskId: string;
  referenceCode?: string | null;
  apiUrl: string;
  appUrl: string;
};

export type TaskStatusView = TaskLink & {
  status: string;
  description: string;
  reward: string;
  expiryTime?: string | null;
  submissionCount?: number | null;
  submissionWindowOpen?: boolean | null;
  network: typeof BASE_NETWORK_NAME;
};

export type SubmissionView = {
  id: string;
  workerAddress: string;
  submittedAt?: string | null;
  rejectedAt?: string | null;
  fileUrl?: string | null;
  artifactNames: string[];
};

export type CreateTaskResult = TaskLink & {
  intentId?: string | null;
  idempotencyKey: string;
};

export type IntentStatus = {
  intentId: string;
  idempotencyKey: string;
  operation: string;
  status: string;
  txHash?: string | null;
  terminalReason?: string | null;
  taskId?: string | null;
};

export type TaskmarketClientOptions = {
  account: TaskmarketAccount;
  apiUrl?: string;
  appUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  randomUUID?: () => string;
  attempts?: PaymentAttemptStore;
  authorizations?: AuthorizationStore;
  /** Confirmation lifetime. Defaults to DEFAULT_AUTHORIZATION_TTL_MS. */
  authorizationTtlMs?: number;
  /** Optional legal receipt from Taskmarket legal accept. */
  legalReceipt?: string;
  logger?: {
    info?: (message: string, extra?: Record<string, unknown>) => void;
    warn?: (message: string, extra?: Record<string, unknown>) => void;
  };
};

export type TaskmarketRuntime = {
  previewCreate: (draft: CreateTaskDraft) => TaskPreview;
  confirm: (preview: TaskPreview) => ExplicitAuthorization;
  createTask: (
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ) => Promise<CreateTaskResult>;
  getTask: (taskId: string) => Promise<TaskStatusView>;
  listSubmissions: (taskId: string) => Promise<SubmissionView[]>;
  previewAccept: (input: {
    taskId: string;
    workerAddress: string;
    shareBps?: number;
  }) => TaskPreview;
  acceptSubmission: (
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ) => Promise<IntentStatus>;
  previewReject: (input: {
    taskId: string;
    workerAddress: string;
  }) => TaskPreview;
  rejectSubmission: (
    preview: TaskPreview,
    authorization: ExplicitAuthorization
  ) => Promise<IntentStatus>;
  recoverPayment: (idempotencyKey: string) => Promise<IntentStatus>;
};

export type TaskmarketExtensionOptions = Omit<
  TaskmarketClientOptions,
  'account'
> & {
  account: TaskmarketAccount;
};
