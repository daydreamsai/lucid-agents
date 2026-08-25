import { keccak256, stringToBytes } from 'viem';

import {
  BASE_CAIP2,
  BASE_NETWORK_NAME,
  BASE_USDC_ADDRESS,
  TASKMARKET_API_FEE_BASE_UNITS,
} from './constants';
import { TaskmarketError } from './errors';
import {
  canonicalJson,
  formatUsdc,
  parseBaseUnits,
  parseUsdcToBaseUnits,
} from './money';
import type {
  CreateTaskDraft,
  ExplicitAuthorization,
  TaskPreview,
} from './types';

function previewIdFor(payload: Record<string, unknown>): string {
  return keccak256(stringToBytes(canonicalJson(payload)));
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TaskmarketError('invalid_input', `${field} is required`);
  }
  return trimmed;
}

export function resolveRewardBaseUnits(draft: CreateTaskDraft): bigint {
  if (draft.rewardBaseUnits != null && draft.rewardUsdc != null) {
    throw new TaskmarketError(
      'invalid_input',
      'Provide only one of rewardUsdc or rewardBaseUnits'
    );
  }
  if (draft.rewardBaseUnits != null) {
    return parseBaseUnits(draft.rewardBaseUnits);
  }
  if (draft.rewardUsdc != null) {
    return parseUsdcToBaseUnits(draft.rewardUsdc);
  }
  throw new TaskmarketError('invalid_input', 'Reward is required');
}

export function previewCreateTask(
  draft: CreateTaskDraft,
  options: { now: () => number; randomUUID: () => string }
): TaskPreview {
  const description = requireText(draft.description, 'description');
  const deliverables = requireText(draft.deliverables, 'deliverables');
  if (!Number.isFinite(draft.durationHours) || draft.durationHours <= 0) {
    throw new TaskmarketError('invalid_input', 'durationHours must be > 0');
  }
  if (!Array.isArray(draft.tags) || draft.tags.length === 0) {
    throw new TaskmarketError('invalid_input', 'At least one tag is required');
  }
  const rewardBaseUnits = resolveRewardBaseUnits(draft);
  const maxSpend =
    draft.maxSpendBaseUnits == null
      ? rewardBaseUnits
      : parseBaseUnits(draft.maxSpendBaseUnits);
  if (rewardBaseUnits > maxSpend) {
    throw new TaskmarketError(
      'exceeds_max_spend',
      'Reward exceeds the configured maximum spend'
    );
  }
  const createdAt = options.now();
  const deadlineIso = new Date(
    createdAt + draft.durationHours * 60 * 60 * 1000
  ).toISOString();
  const createdAtIso = new Date(createdAt).toISOString();
  const idempotencyKey = options.randomUUID();
  const mode = draft.mode ?? 'bounty';
  const tags = draft.tags.map(tag => requireText(tag, 'tag'));
  const unsigned = {
    operation: 'create' as const,
    description,
    rewardBaseUnits: rewardBaseUnits.toString(),
    durationHours: draft.durationHours,
    deadlineIso,
    deliverables,
    network: BASE_NETWORK_NAME,
    networkCaip2: BASE_CAIP2,
    asset: BASE_USDC_ADDRESS,
    maxSpendBaseUnits: maxSpend.toString(),
    mode,
    tags,
  };
  return {
    ...unsigned,
    previewId: previewIdFor(unsigned),
    idempotencyKey,
    rewardUsdc: formatUsdc(rewardBaseUnits),
    maxSpendUsdc: formatUsdc(maxSpend),
    assetSymbol: 'USDC',
    createdAtIso,
  };
}

export function previewAcceptSubmission(
  input: { taskId: string; workerAddress: string; shareBps?: number },
  options: { now: () => number; randomUUID: () => string }
): TaskPreview {
  const taskId = requireText(input.taskId, 'taskId');
  const workerAddress = requireText(input.workerAddress, 'workerAddress');
  const shareBps = input.shareBps ?? 10_000;
  if (!Number.isInteger(shareBps) || shareBps <= 0 || shareBps > 10_000) {
    throw new TaskmarketError('invalid_input', 'shareBps must be 1-10000');
  }
  const createdAtIso = new Date(options.now()).toISOString();
  const unsigned = {
    operation: 'accept' as const,
    taskId,
    workerAddress,
    shareBps,
    description: `Human review accept of worker ${workerAddress} on ${taskId}`,
    rewardBaseUnits: TASKMARKET_API_FEE_BASE_UNITS.toString(),
    durationHours: null,
    deadlineIso: null,
    deliverables: 'Release escrow to the selected worker after human review',
    network: BASE_NETWORK_NAME,
    networkCaip2: BASE_CAIP2,
    asset: BASE_USDC_ADDRESS,
    maxSpendBaseUnits: TASKMARKET_API_FEE_BASE_UNITS.toString(),
    mode: null,
    tags: [] as string[],
  };
  return {
    ...unsigned,
    previewId: previewIdFor(unsigned),
    idempotencyKey: options.randomUUID(),
    rewardUsdc: formatUsdc(TASKMARKET_API_FEE_BASE_UNITS),
    durationHours: null,
    deadlineIso: null,
    maxSpendUsdc: formatUsdc(TASKMARKET_API_FEE_BASE_UNITS),
    assetSymbol: 'USDC',
    mode: null,
    tags: [],
    createdAtIso,
  };
}

export function previewRejectSubmission(
  input: { taskId: string; workerAddress: string },
  options: { now: () => number; randomUUID: () => string }
): TaskPreview {
  const taskId = requireText(input.taskId, 'taskId');
  const workerAddress = requireText(input.workerAddress, 'workerAddress');
  const createdAtIso = new Date(options.now()).toISOString();
  const unsigned = {
    operation: 'reject' as const,
    taskId,
    workerAddress,
    description: `Human review reject of worker ${workerAddress} on ${taskId}`,
    rewardBaseUnits: TASKMARKET_API_FEE_BASE_UNITS.toString(),
    durationHours: null,
    deadlineIso: null,
    deliverables: 'Reject a submission after human review; never auto-reject',
    network: BASE_NETWORK_NAME,
    networkCaip2: BASE_CAIP2,
    asset: BASE_USDC_ADDRESS,
    maxSpendBaseUnits: TASKMARKET_API_FEE_BASE_UNITS.toString(),
    mode: null,
    tags: [] as string[],
  };
  return {
    ...unsigned,
    previewId: previewIdFor(unsigned),
    idempotencyKey: options.randomUUID(),
    rewardUsdc: formatUsdc(TASKMARKET_API_FEE_BASE_UNITS),
    durationHours: null,
    deadlineIso: null,
    maxSpendUsdc: formatUsdc(TASKMARKET_API_FEE_BASE_UNITS),
    assetSymbol: 'USDC',
    mode: null,
    tags: [],
    createdAtIso,
  };
}

export function assertAuthorized(
  preview: TaskPreview,
  authorization: ExplicitAuthorization
): void {
  if (authorization?.confirmed !== true) {
    throw new TaskmarketError(
      'authorization_required',
      'Fresh explicit user authorization is required before creating or funding a task'
    );
  }
  if (authorization.previewId !== preview.previewId) {
    throw new TaskmarketError(
      'preview_mismatch',
      'Authorization previewId does not match the issued preview'
    );
  }
}

export function fingerprintPreview(preview: TaskPreview): string {
  const unsigned = {
    operation: preview.operation,
    description: preview.description,
    rewardBaseUnits: preview.rewardBaseUnits,
    durationHours: preview.durationHours,
    deadlineIso: preview.deadlineIso,
    deliverables: preview.deliverables,
    network: preview.network,
    networkCaip2: preview.networkCaip2,
    asset: preview.asset,
    maxSpendBaseUnits: preview.maxSpendBaseUnits,
    mode: preview.mode,
    tags: preview.tags,
    taskId: preview.taskId,
    workerAddress: preview.workerAddress,
    shareBps: preview.shareBps,
  };
  return previewIdFor(unsigned);
}

export function assertPreviewIntegrity(preview: TaskPreview): void {
  if (fingerprintPreview(preview) !== preview.previewId) {
    throw new TaskmarketError(
      'preview_tampered',
      'Preview fields do not match previewId; refuse to pay'
    );
  }
}
