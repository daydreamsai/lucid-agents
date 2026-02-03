import type { AgentCardWithEntrypoints } from '../a2a';
import type { WalletConnector, WalletMetadata } from '../wallets';
import type { AgentRuntime } from '../core';
import type { FetchFunction } from '../http';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type Schedule =
  | { kind: 'interval'; everyMs: number }
  | { kind: 'once'; at: number };

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
  /** Network in CAIP-2 format (e.g., 'eip155:8453' for Base) */
  network: string;
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
 * - Optional payer wallet metadata (for auditing/tracking)
 * - The schedule and parameters for invocations
 *
 * Payment is handled by the paymentContext provided to the scheduler runtime.
 */
export type Hire = {
  id: string;
  agent: AgentRef;
  /** Optional wallet metadata for auditing/tracking. Payment is handled by paymentContext. */
  wallet?: WalletRef;
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
  getJobs?(): Promise<Job[]>;
  getDueJobs(now: number, limit: number): Promise<Job[]>;
  claimJob(
    jobId: string,
    workerId: string,
    leaseMs: number,
    now: number
  ): Promise<boolean>;
  getExpiredLeases?(now: number): Promise<Job[]>;
};

/**
 * Arguments passed to the invoke function when executing a scheduled job.
 *
 * For the simple API (a2aClient + paymentContext), only manifest, entrypointKey,
 * input, and jobId are used. Payment is handled automatically by paymentContext.
 *
 * For the legacy custom invoke API, walletRef and walletConnector are also available.
 */
export type InvokeArgs = {
  /** The agent's manifest/card containing entrypoints and payment info */
  manifest: AgentCardWithEntrypoints;
  /** The entrypoint to invoke on the agent */
  entrypointKey: string;
  /** Input data for the entrypoint */
  input: JsonValue;
  /** Unique job ID for tracking */
  jobId: string;
  /** Optional idempotency key to prevent duplicate executions */
  idempotencyKey?: string;
  /** @deprecated Wallet metadata - only used with custom invoke function */
  walletRef?: WalletRef;
  /** @deprecated Wallet connector - only used with custom invoke + walletResolver */
  walletConnector?: WalletConnector;
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
export type WalletResolver = (
  walletRef: WalletRef
) => Promise<WalletConnector | undefined>;

export type OperationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export type SchedulerRuntime = {
  /**
   * Create a new hire to schedule agent invocations.
   *
   * @param input.agentCardUrl - URL to fetch the agent's card
   * @param input.entrypointKey - Which entrypoint to invoke on the agent
   * @param input.schedule - When/how often to invoke
   * @param input.jobInput - Input data to pass to the entrypoint
   * @param input.wallet - Optional wallet metadata for auditing (payment handled by paymentContext)
   */
  createHire(input: {
    agentCardUrl: string;
    entrypointKey: string;
    schedule: Schedule;
    jobInput: JsonValue;
    /** Optional wallet metadata for auditing. Payment is handled by paymentContext. */
    wallet?: WalletRef;
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

/**
 * Payment context from createRuntimePaymentContext.
 * Contains the x402-enabled fetch function for making paid calls.
 */
export type PaymentContext = {
  fetchWithPayment: FetchFunction | null;
  walletAddress: `0x${string}` | null;
  chainId: number | null;
};

