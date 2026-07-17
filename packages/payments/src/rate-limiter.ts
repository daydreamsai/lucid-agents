import type { PaymentRateLimiter } from '@lucid-agents/types/payments';

/**
 * Rate limiter for tracking payments per time window per policy group.
 * Uses sliding window approach (in-memory).
 * All state is lost on restart - this is acceptable for now.
 *
 * Tracks payment timestamps per policy group and enforces rate limits
 * based on maximum payments allowed within a time window.
 */
class InMemoryRateLimiter implements PaymentRateLimiter {
  private payments: Map<string, number[]> = new Map();

  /**
   * Checks if a payment would exceed the rate limit.
   * @param groupName - Policy group name
   * @param maxPayments - Maximum number of payments allowed
   * @param windowMs - Time window in milliseconds
   * @returns Result indicating if allowed
   */
  checkLimit(
    groupName: string,
    maxPayments: number,
    windowMs: number
  ): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = this.payments.get(groupName);
    if (!timestamps) {
      timestamps = [];
      this.payments.set(groupName, timestamps);
    }

    const validTimestamps = timestamps.filter(ts => ts > cutoff);
    this.payments.set(groupName, validTimestamps);

    if (validTimestamps.length >= maxPayments) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for policy group "${groupName}". ${validTimestamps.length} payments in the last ${windowMs}ms, limit is ${maxPayments}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Records a payment after successful execution.
   * @param groupName - Policy group name
   */
  recordPayment(groupName: string): void {
    const now = Date.now();

    let timestamps = this.payments.get(groupName);
    if (!timestamps) {
      timestamps = [];
      this.payments.set(groupName, timestamps);
    }

    timestamps.push(now);
  }

  /**
   * Gets the current count of payments within the window (for informational purposes).
   * @param groupName - Policy group name
   * @param windowMs - Time window in milliseconds
   * @returns Current count of payments
   */
  getCurrentCount(groupName: string, windowMs: number): number {
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = this.payments.get(groupName);
    if (!timestamps) {
      return 0;
    }

    return timestamps.filter(ts => ts > cutoff).length;
  }

  /**
   * Clears all rate limit data (useful for testing or reset).
   */
  clear(): void {
    this.payments.clear();
  }
}

/**
 * Creates a new rate limiter instance.
 * @returns A new payment rate limiter for tracking payment rate limits
 */
export function createRateLimiter(): PaymentRateLimiter {
  return new InMemoryRateLimiter();
}
