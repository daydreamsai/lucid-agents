import type {
  MppChallengeBinding,
  MppChallengeClaim,
  MppChallengeIssue,
  MppChallengeLeaseRenewal,
  MppStoredAuthorization,
} from '@lucid-agents/types/mpp';

/** Default duration of an exclusive MPP verification lease. */
export const DEFAULT_MPP_CHALLENGE_LEASE_MS = 30_000;
/** Default maximum number of live or recoverable MPP challenges. */
export const DEFAULT_MAX_MPP_CHALLENGES = 10_000;
const DEFAULT_MPP_AUTHORIZATION_RETENTION_MS = 24 * 60 * 60 * 1_000;

/** Capacity, lease, retention, and clock options shared by challenge stores. */
export type MppChallengeStoreOptions = {
  /** Maximum live and recoverable records retained by this store. */
  maxEntries?: number;
  /** Default exclusive verification lease duration. */
  leaseMs?: number;
  /** Retention for verified idempotent authorization recovery. */
  authorizationRetentionMs?: number;
  /** Clock override for deterministic tests. */
  now?: () => number;
};

/** Fully resolved challenge-store options used by storage adapters. */
export type NormalizedMppChallengeStoreOptions = {
  maxEntries: number;
  leaseMs: number;
  authorizationRetentionMs: number;
  now: () => number;
};

type StoredMppChallengeState = 'issued' | 'leased' | 'consumed';

/** Internal persisted representation of an MPP challenge lifecycle. */
export type StoredMppChallengeRecord = MppChallengeIssue & {
  state: StoredMppChallengeState;
  leaseId?: string;
  leaseExpiresAt?: number;
  idempotencyKey?: string;
  authorization?: MppStoredAuthorization;
};

/** Validate and fill defaults for challenge-store options. */
export function normalizeMppChallengeStoreOptions(
  options: MppChallengeStoreOptions = {}
): NormalizedMppChallengeStoreOptions {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_MPP_CHALLENGES;
  const leaseMs = options.leaseMs ?? DEFAULT_MPP_CHALLENGE_LEASE_MS;
  const authorizationRetentionMs =
    options.authorizationRetentionMs ?? DEFAULT_MPP_AUTHORIZATION_RETENTION_MS;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new Error(
      'MPP challenge store maxEntries must be a positive integer'
    );
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
    throw new Error('MPP challenge store leaseMs must be a positive integer');
  }
  if (
    !Number.isSafeInteger(authorizationRetentionMs) ||
    authorizationRetentionMs <= 0
  ) {
    throw new Error(
      'MPP challenge store authorizationRetentionMs must be a positive integer'
    );
  }
  return {
    maxEntries,
    leaseMs,
    authorizationRetentionMs,
    now: options.now ?? Date.now,
  };
}

/** Validate an MPP challenge before persistence. */
export function validateChallengeIssue(challenge: MppChallengeIssue): void {
  if (!challenge.challengeId.trim()) {
    throw new Error('MPP challenge id must not be empty');
  }
  validateBinding(challenge.binding);
  if (
    !Number.isSafeInteger(challenge.issuedAt) ||
    !Number.isSafeInteger(challenge.expiresAt) ||
    challenge.expiresAt <= challenge.issuedAt
  ) {
    throw new Error('MPP challenge expiry must be after its issue time');
  }
}

/** Validate an MPP challenge claim before leasing it. */
export function validateChallengeClaim(claim: MppChallengeClaim): void {
  if (!claim.challengeId.trim()) {
    throw new Error('MPP challenge id must not be empty');
  }
  validateBinding(claim.binding);
  if (
    claim.leaseMs !== undefined &&
    (!Number.isSafeInteger(claim.leaseMs) || claim.leaseMs <= 0)
  ) {
    throw new Error('MPP challenge leaseMs must be a positive integer');
  }
  if (claim.idempotencyKey !== undefined && !claim.idempotencyKey.trim()) {
    throw new Error('MPP challenge idempotency key must not be empty');
  }
}

/** Validate a requested verification-lease renewal. */
export function validateChallengeLeaseRenewal(
  renewal: MppChallengeLeaseRenewal
): void {
  if (!renewal.challengeId.trim() || !renewal.leaseId.trim()) {
    throw new Error('MPP challenge renewal requires challengeId and leaseId');
  }
  if (
    renewal.leaseMs !== undefined &&
    (!Number.isSafeInteger(renewal.leaseMs) || renewal.leaseMs <= 0)
  ) {
    throw new Error('MPP challenge leaseMs must be a positive integer');
  }
}

/** Schedule renewal well before expiry while avoiding a zero-delay loop. */
export function challengeLeaseRenewAfterMs(
  now: number,
  leaseExpiresAt: number
): number {
  return Math.max(1, Math.floor((leaseExpiresAt - now) / 3));
}

/** Validate an optional authorization before recovery persistence. */
export function validateStoredAuthorization(
  authorization: MppStoredAuthorization | undefined
): void {
  if (authorization !== undefined && !authorization.receipt.trim()) {
    throw new Error('MPP stored authorization receipt must not be empty');
  }
  const payment = authorization?.payment;
  if (
    payment &&
    (typeof payment.amount !== 'string' ||
      !payment.amount.trim() ||
      typeof payment.currency !== 'string' ||
      !payment.currency.trim() ||
      typeof payment.method !== 'string' ||
      !payment.method.trim() ||
      (payment.intent !== 'charge' && payment.intent !== 'session'))
  ) {
    throw new Error('MPP stored payment selection is invalid');
  }
}

/** Serialize selected payment terms for durable storage. */
export function serializeStoredPayment(
  payment: MppStoredAuthorization['payment']
): string | null {
  if (!payment) return null;
  return JSON.stringify({
    amount: payment.amount,
    currency: payment.currency,
    intent: payment.intent,
    method: payment.method,
  });
}

/** Deserialize and validate selected payment terms from durable storage. */
export function deserializeStoredPayment(
  serialized: string | null
): MppStoredAuthorization['payment'] {
  if (!serialized) return undefined;
  const value = JSON.parse(serialized) as Record<string, unknown>;
  const payment = {
    amount: value.amount,
    currency: value.currency,
    intent: value.intent,
    method: value.method,
  } as MppStoredAuthorization['payment'];
  validateStoredAuthorization({ receipt: 'validated', payment });
  return payment;
}

/** Clone recoverable authorization data before exposing it to callers. */
export function cloneStoredAuthorization(
  authorization: MppStoredAuthorization
): MppStoredAuthorization {
  return {
    ...authorization,
    ...(authorization.payment ? { payment: { ...authorization.payment } } : {}),
  };
}

/** Compare two request bindings for exact replay-fence equivalence. */
export function bindingMatches(
  left: MppChallengeBinding,
  right: MppChallengeBinding
): boolean {
  return (
    left.entrypointKey === right.entrypointKey &&
    left.operation === right.operation &&
    left.challengeDigest === right.challengeDigest &&
    left.requestMethod === right.requestMethod &&
    left.requestTarget === right.requestTarget &&
    left.requestBodyDigest === right.requestBodyDigest
  );
}

function validateBinding(binding: MppChallengeBinding): void {
  if (!binding.entrypointKey.trim() || !binding.challengeDigest.trim()) {
    throw new Error('MPP challenge binding fields must not be empty');
  }
  if (binding.requestMethod !== undefined && !binding.requestMethod.trim()) {
    throw new Error('MPP challenge request method must not be empty');
  }
  if (binding.requestTarget !== undefined && !binding.requestTarget.trim()) {
    throw new Error('MPP challenge request target must not be empty');
  }
  if (
    binding.requestBodyDigest !== undefined &&
    !binding.requestBodyDigest.trim()
  ) {
    throw new Error('MPP challenge request body digest must not be empty');
  }
}

/** Serialize a challenge binding into its durable representation. */
export function serializeChallengeBinding(
  binding: MppChallengeBinding
): string {
  return JSON.stringify([
    binding.entrypointKey,
    binding.operation,
    binding.challengeDigest,
    binding.requestMethod ?? null,
    binding.requestTarget ?? null,
    binding.requestBodyDigest ?? null,
  ]);
}

/** Deserialize and validate a durable challenge binding. */
export function deserializeChallengeBinding(
  serialized: string
): MppChallengeBinding {
  const value = JSON.parse(serialized) as unknown;
  if (!Array.isArray(value) || value.length !== 6) {
    throw new Error('Stored MPP challenge binding is invalid');
  }
  const [
    entrypointKey,
    operation,
    challengeDigest,
    requestMethod,
    requestTarget,
    requestBodyDigest,
  ] = value;
  if (
    typeof entrypointKey !== 'string' ||
    (operation !== 'invoke' && operation !== 'stream') ||
    typeof challengeDigest !== 'string' ||
    (requestMethod !== null && typeof requestMethod !== 'string') ||
    (requestTarget !== null && typeof requestTarget !== 'string') ||
    (requestBodyDigest !== null && typeof requestBodyDigest !== 'string')
  ) {
    throw new Error('Stored MPP challenge binding is invalid');
  }
  const binding: MppChallengeBinding = {
    entrypointKey,
    operation,
    challengeDigest,
    ...(requestMethod === null ? {} : { requestMethod }),
    ...(requestTarget === null ? {} : { requestTarget }),
    ...(requestBodyDigest === null ? {} : { requestBodyDigest }),
  };
  validateBinding(binding);
  return binding;
}
