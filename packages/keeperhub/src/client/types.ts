/**
 * Types for KeeperHub direct execution.
 * Shapes follow https://docs.keeperhub.com/api/direct-execution (fetched 2026-09-05).
 */

export type ChainInput = number | string;

export interface TransferRequest {
  /** Numeric chain id, numeric string, or a known alias such as "base-sepolia". */
  chainId: ChainInput;
  recipientAddress: string;
  /** Human-readable units, e.g. "0.01". */
  amount: string;
  /** ERC-20 contract. Omit for the native token. */
  tokenAddress?: string | undefined;
  /** JSON string with token metadata for non-standard tokens: {"decimals":18,"symbol":"X"} */
  tokenConfig?: string | undefined;
  gasLimitMultiplier?: string | undefined;
}

/** The body actually sent to KeeperHub: one spelling per value, so idempotency replays match. */
export interface CanonicalTransferBody {
  chainId: string;
  recipientAddress: string;
  amount: string;
  tokenAddress?: string;
  tokenConfig?: string;
  gasLimitMultiplier?: string;
}

export interface ContractCallRequest {
  chainId: ChainInput;
  contractAddress: string;
  functionName: string;
  /** JSON array string, e.g. '["0x...", "1000"]' */
  functionArgs?: string | undefined;
  /** ABI JSON string. Auto-fetched from the explorer when omitted. */
  abi?: string | undefined;
  /** Native value in ether units for payable functions. */
  value?: string | undefined;
  gasLimitMultiplier?: string | undefined;
}

export interface CanonicalContractCallBody {
  chainId: string;
  contractAddress: string;
  functionName: string;
  functionArgs?: string;
  abi?: string;
  value?: string;
  gasLimitMultiplier?: string;
}

export interface SimulationResult {
  success: boolean;
  status?: string;
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  wouldRevert: boolean;
  code?: string;
  failureKind?: string;
  revertReason?: string;
  raw: Record<string, unknown>;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'unconfirmed'
  | 'completed'
  | 'failed'
  | (string & {});

export type ReceiptStatus =
  | 'success'
  | 'reverted'
  | 'safe_inner_failure'
  | 'not_found'
  | 'timeout'
  | (string & {});

export interface Receipt {
  hash: string;
  chainId?: number;
  /** Whether this hash positively confirmed onchain (re-fetched by KeeperHub). */
  verified: boolean;
  receiptStatus: ReceiptStatus;
  blockNumber?: number;
  gasUsed?: string;
  verifiedAt?: string;
}

/** Response of a broadcast request (HTTP 202). */
export interface ExecutionAccepted {
  executionId: string;
  status: ExecutionStatus;
  transactionHash?: string;
  transactionLink?: string;
  /** True only when KeeperHub answered from its idempotency store. */
  idempotentReplay: boolean;
  raw: Record<string, unknown>;
}

/** Response of GET /api/execute/{executionId}/status plus the poll hint header. */
export interface ExecutionState {
  executionId: string;
  status: ExecutionStatus;
  type?: string;
  network?: string;
  transactionHash?: string;
  transactionLink?: string;
  sponsored: boolean;
  receipts: Receipt[];
  gasUsedWei?: string;
  gasPriceWei?: string;
  error?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  /** Seconds from X-Poll-Interval-Hint; null when the header is absent. 0 means terminal. */
  pollIntervalHint: number | null;
  /** Decided from the hint header when present, otherwise from the documented terminal statuses. */
  terminal: boolean;
  raw: Record<string, unknown>;
}

/** What a caller is allowed to call "landed". */
export interface VerifiedExecution {
  executionId: string;
  transactionHash: string;
  transactionLink?: string;
  receipt: Receipt;
  sponsored: boolean;
  /** The broadcast request was answered from KeeperHub's idempotency store. */
  replayed: boolean;
  state: ExecutionState;
}

export type ClientEvent =
  | {
      type: 'request';
      method: string;
      path: string;
      attempt: number;
      idempotencyKey?: string;
    }
  | {
      type: 'response';
      method: string;
      path: string;
      status: number;
      ms: number;
      requestId?: string;
    }
  | { type: 'simulated'; path: string; result: SimulationResult }
  | { type: 'accepted'; path: string; execution: ExecutionAccepted }
  | { type: 'status'; state: ExecutionState }
  | { type: 'waiting'; reason: string; ms: number }
  | { type: 'verified'; execution: VerifiedExecution };

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

/** Workflow API shapes (https://docs.keeperhub.com/api/workflows). */
export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action';
  data: { label: string; config: Record<string, unknown> };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled?: boolean;
  projectId?: string;
  tagId?: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export interface WorkflowTransactionHash {
  hash: string;
  chainId?: number;
  receiptStatus?: string;
  verified?: boolean;
  link?: string;
  raw: Record<string, unknown>;
}

/** GET /api/workflows/executions/{id}/wait */
export interface WorkflowExecutionResult {
  executionId: string;
  /** "success", "error", "system_error", "cancelled", or a non-terminal status when `completed` is false. */
  status: string;
  completed: boolean;
  transactionHashes: WorkflowTransactionHash[];
  output: unknown;
  error: string | null;
  gasUsedWei: string | null;
  completedAt: string | null;
  raw: Record<string, unknown>;
}
