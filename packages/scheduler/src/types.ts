import type {
  AgentCardWithEntrypoints,
  WalletConnector,
  WalletMetadata,
} from '@lucid-agents/types';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type Schedule =
  | { kind: 'interval'; everyMs: number }
  | { kind: 'once'; at: number }
  | { kind: 'cron'; expr: string };

/**
 * Serializable reference to the PAYER's wallet stored with a Hire.
 * This is the wallet that will PAY for invoking the agent's entrypoints.
 *
 * The agent's receiving address (payee) comes from the agent card's `payments` field.
 *
 * Contains metadata about the wallet for identification purposes.
 * The actual WalletConnector is provided at runtime via the walletResolver.
 */
export type WalletRef = WalletMetadata & {
  /** Unique identifier for this wallet binding */
  id: string;
};

/**
 * @deprecated Use WalletRef instead. This type is kept for backwards compatibility.
 */
export type WalletBinding = {
  walletId: string;
  network:
    | 'base'
    | 'ethereum'
    | 'sepolia'
    | 'base-sepolia'
    | 'solana'
    | 'solana-devnet';
  address: string;
};

export type AgentRef = {
  agentCardUrl: string;
  card?: AgentCardWithEntrypoints;
  cachedAt?: number;
};

/**
 * A Hire represents an agreement to invoke an agent's entrypoint on a schedule.
 *
 * The hire links:
 * - The agent to call (via agent card URL)
 * - The payer's wallet (who pays for the calls)
 * - The schedule and parameters for invocations
 *
 * Payment flow:
 * 1. The payer's wallet (`wallet`) is used to sign/pay for calls
 * 2. The agent's payee address comes from the agent card's `payments` field
 * 3. On each scheduled invocation, funds flow from payer → agent
 */
export type Hire = {
  id: string;
  agent: AgentRef;
  /** The PAYER's wallet - used to pay for invoking the agent */
  wallet: WalletRef;
  status: 'active' | 'paused' | 'canceled';
  metadata?: Record<string, JsonValue>;
};

export type JobStatus =
  | 'pending'
  | 'leased'
  | 'failed'
  | 'completed'
  | 'paused';

export type Job = {
  id: string;
  hireId: string;
  entrypointKey: string;
  input: JsonValue;
  schedule: Schedule;
  nextRunAt: number;
  attempts: number;
  maxRetries: number;
  status: JobStatus;
  idempotencyKey?: string;
  lease?: {
    workerId: string;
    expiresAt: number;
  };
  lastError?: string;
};

export type SchedulerStore = {
  putHire(hire: Hire): Promise<void>;
  getHire(id: string): Promise<Hire | undefined>;
  deleteHire?(id: string): Promise<void>;
  putJob(job: Job): Promise<void>;
  getJob(id: string): Promise<Job | undefined>;
  getDueJobs(now: number, limit: number): Promise<Job[]>;
  claimJob(jobId: string, workerId: string, leaseMs: number): Promise<boolean>;
  getExpiredLeases?(now: number): Promise<Job[]>;
};

/**
 * Arguments passed to the invoke function when executing a scheduled job.
 *
 * The invoke function is responsible for:
 * 1. Making the HTTP call to the agent's entrypoint
 * 2. Handling payment (using walletConnector to pay the agent)
 *
 * Payment info:
 * - `walletRef` / `walletConnector` = the PAYER's wallet (signs/pays)
 * - `manifest.payments[].payee` = the AGENT's address (receives payment)
 */
export type InvokeArgs = {
  /** The agent's manifest/card containing entrypoints and payment info */
  manifest: AgentCardWithEntrypoints;
  /** The entrypoint to invoke on the agent */
  entrypointKey: string;
  /** Input data for the entrypoint */
  input: JsonValue;
  /** The PAYER's wallet reference (metadata for identification) */
  walletRef: WalletRef;
  /** The PAYER's wallet connector for signing/paying (if walletResolver provided) */
  walletConnector?: WalletConnector;
  /** Unique job ID for tracking */
  jobId: string;
  /** Optional idempotency key to prevent duplicate executions */
  idempotencyKey?: string;
};

export type InvokeFn = (args: InvokeArgs) => Promise<void>;

/**
 * Function to resolve a WalletRef to a WalletConnector at runtime.
 *
 * The WalletRef is a serializable reference to the PAYER's wallet.
 * The WalletConnector provides signing capabilities needed to make payments.
 *
 * This separation allows:
 * - Storing wallet references in a database (serializable WalletRef)
 * - Loading actual signing keys only when needed (WalletConnector)
 */
export type WalletResolver = (walletRef: WalletRef) => Promise<WalletConnector | undefined>;

export type OperationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type SchedulerRuntime = {
  /**
   * Create a new hire to schedule agent invocations.
   *
   * @param input.agentCardUrl - URL to fetch the agent's card (contains payee info)
   * @param input.wallet - The PAYER's wallet that will pay for invocations
   * @param input.entrypointKey - Which entrypoint to invoke on the agent
   * @param input.schedule - When/how often to invoke
   * @param input.jobInput - Input data to pass to the entrypoint
   */
  createHire(input: {
    agentCardUrl: string;
    /** The PAYER's wallet - will be used to pay the agent for each invocation */
    wallet: WalletRef;
    entrypointKey: string;
    schedule: Schedule;
    jobInput: JsonValue;
    maxRetries?: number;
    idempotencyKey?: string;
    metadata?: Record<string, JsonValue>;
  }): Promise<{ hire: Hire; job: Job }>;
  addJob(input: {
    hireId: string;
    entrypointKey: string;
    schedule: Schedule;
    jobInput: JsonValue;
    maxRetries?: number;
    idempotencyKey?: string;
  }): Promise<Job>;
  pauseHire(hireId: string): Promise<OperationResult>;
  resumeHire(hireId: string): Promise<OperationResult>;
  cancelHire(hireId: string): Promise<OperationResult>;
  pauseJob(jobId: string): Promise<OperationResult>;
  resumeJob(jobId: string, nextRunAt?: number): Promise<OperationResult>;
  tick(options?: { workerId?: string; concurrency?: number }): Promise<void>;
  recoverExpiredLeases(): Promise<number>;
};

export type SchedulerRuntimeOptions = {
  store: SchedulerStore;
  invoke: InvokeFn;
  /**
   * Optional resolver to get a WalletConnector from a WalletRef.
   * If provided, the resolved connector will be passed to the invoke function.
   * This enables signing transactions during job execution.
   */
  walletResolver?: WalletResolver;
  fetchAgentCard?: (url: string) => Promise<AgentCardWithEntrypoints>;
  clock?: () => number;
  defaultMaxRetries?: number;
  leaseMs?: number;
  maxDueBatch?: number;
  agentCardTtlMs?: number;
  defaultConcurrency?: number;
};
