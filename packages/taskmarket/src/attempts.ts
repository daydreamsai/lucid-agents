import type { PaymentAttempt, PaymentAttemptStore } from './types';

export function createInMemoryPaymentAttemptStore(): PaymentAttemptStore {
  const attempts = new Map<string, PaymentAttempt>();
  return {
    get(idempotencyKey) {
      return attempts.get(idempotencyKey);
    },
    set(attempt) {
      attempts.set(attempt.idempotencyKey, attempt);
    },
    list() {
      return [...attempts.values()];
    },
  };
}

export function isBlockingAttempt(
  attempt: PaymentAttempt | undefined
): boolean {
  return attempt?.status === 'in_flight' || attempt?.status === 'unknown';
}
