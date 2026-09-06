export type {
  ExecuteOptions,
  KeeperHubClientOptions,
  VerifyOptions,
  WaitOptions,
} from './client';
export { assertVerified, KeeperHubClient, parseState } from './client';
export type { ExecutionFailureReason, KeeperHubErrorOptions } from './errors';
export {
  AuthError,
  ExecutionFailed,
  ExecutionUnconfirmed,
  IdempotencyConflict,
  IdempotencyInProgress,
  KeeperHubError,
  PreflightFailed,
  RateLimited,
  SpendingCapExceeded,
} from './errors';
export type { ContractCallKeyInput, TransferKeyInput } from './idempotency';
export {
  canonicalAmount,
  canonicalChainId,
  canonicalContractCallBody,
  canonicalTransferBody,
  contractCallKeyMaterial,
  deriveContractCallKey,
  deriveTransferKey,
  encodeTaskId,
  normalizeAddress,
  sha256Hex,
  transferKeyMaterial,
} from './idempotency';
export type {
  CanonicalContractCallBody,
  CanonicalTransferBody,
  ChainInput,
  ClientEvent,
  ContractCallRequest,
  ExecutionAccepted,
  ExecutionState,
  ExecutionStatus,
  FetchLike,
  Receipt,
  ReceiptStatus,
  SimulationResult,
  TransferRequest,
  VerifiedExecution,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecutionResult,
  WorkflowNode,
  WorkflowSummary,
  WorkflowTransactionHash,
} from './types';
export type { ScheduledTransferWorkflowInput } from './workflows';
export { isValidCron, scheduledTransferWorkflow } from './workflows';

export const KEEPERHUB_CHAINS = {
  ETHEREUM: '1',
  SEPOLIA: '11155111',
  BASE: '8453',
  BASE_SEPOLIA: '84532',
  ARBITRUM: '42161',
  OPTIMISM: '10',
  POLYGON: '137',
} as const;

/** USDC contracts from https://docs.keeperhub.com/platform-reference (2026-09-05). */
export const USDC = {
  '1': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '11155111': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  '8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  '42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  '10': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  '137': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
} as const;

/** Deterministic in-memory KeeperHub for tests and the dead-network replay mode. */
export type { MockCall, MockOptions } from './mock';
export { createMockKeeperHub, virtualClock } from './mock';
