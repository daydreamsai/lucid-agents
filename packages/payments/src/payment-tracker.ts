import type {
  PaymentDirection,
  PaymentRecord,
  PaymentTracker as PaymentTrackerInterface,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';
import { createInMemoryPaymentStorage } from './in-memory-payment-storage';

const RATE_RESERVATION_PREFIX = '\u0000rate:';

/**
 * Formats a BigInt amount (in base units with 6 decimals) to a human-friendly USDC string.
 * @param amount - Amount in base units (USDC has 6 decimals)
 * @returns Formatted string (e.g., "1.5" for 1.5 USDC, "1" for 1.0 USDC)
 */
function formatUsdcAmount(amount: bigint): string {
  const usdc = Number(amount) / 1_000_000;
  return usdc.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Tracks payments (both outgoing and incoming) per policy group and scope.
 * Uses storage abstraction to support different backends (SQLite, In-Memory, Postgres).
 */
export class PaymentTracker implements PaymentTrackerInterface {
  constructor(private storage: PaymentStorage) {}

  private async reserveTotalLimit(
    direction: PaymentDirection,
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    amount: bigint
  ): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    const result = await this.storage.reservePaymentLimit({
      groupName,
      scope,
      direction,
      amount,
      maxTotal: BigInt(Math.floor(maxTotalUsd * 1_000_000)),
      windowMs,
      ttlMs: 5 * 60 * 1000,
    });
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `Total ${direction} payment limit exceeded for policy group "${groupName}" at scope "${scope}"`,
      };
    }
    return { allowed: true, reservationId: result.reservationId };
  }

  /**
   * Atomically reserve capacity under an incoming total limit for this runtime.
   * The reservation must be committed after settlement or released on failure.
   */
  async reserveIncomingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    amount: bigint
  ): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    return this.reserveTotalLimit(
      'incoming',
      groupName,
      scope,
      maxTotalUsd,
      windowMs,
      amount
    );
  }

  /** Atomically reserve outgoing spend before a payment credential is sent. */
  async reserveOutgoingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    amount: bigint
  ): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    return this.reserveTotalLimit(
      'outgoing',
      groupName,
      scope,
      maxTotalUsd,
      windowMs,
      amount
    );
  }

  /**
   * Atomically reserve one payment in a storage-backed sliding window.
   * Synthetic records are hidden from the public payment history.
   */
  async reserveRateLimit(
    groupName: string,
    direction: PaymentDirection,
    maxPayments: number,
    windowMs: number
  ): Promise<{ allowed: boolean; reservationId?: string; reason?: string }> {
    const result = await this.storage.reservePaymentLimit({
      groupName: `${RATE_RESERVATION_PREFIX}${groupName}`,
      scope: 'global',
      direction,
      amount: 1n,
      maxTotal: BigInt(maxPayments),
      windowMs,
      ttlMs: Math.max(windowMs, 60_000),
    });
    if (!result.allowed) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for policy group "${groupName}"`,
      };
    }
    return { allowed: true, reservationId: result.reservationId };
  }

  async commitReservation(reservationId: string): Promise<void> {
    await this.commitReservations([reservationId]);
  }

  /** Atomically commit a complete payment-policy accounting batch. */
  async commitReservations(
    reservationIds: readonly string[],
    records: readonly Omit<PaymentRecord, 'id' | 'timestamp'>[] = []
  ): Promise<void> {
    if (reservationIds.length === 0 && records.length === 0) return;
    const settlementId = await this.stageSettlement(reservationIds, records);
    await this.commitSettlement(settlementId);
  }

  /**
   * Protect policy accounting from reservation expiry before an irreversible
   * payment settlement starts.
   */
  async stageSettlement(
    reservationIds: readonly string[],
    records: readonly Omit<PaymentRecord, 'id' | 'timestamp'>[] = []
  ): Promise<string> {
    if (reservationIds.length === 0 && records.length === 0) {
      throw new Error('Settlement accounting batch must not be empty');
    }
    const settlementId = await this.storage.stagePaymentSettlement(
      reservationIds,
      records
    );
    if (!settlementId) {
      throw new Error('One or more payment reservations expired');
    }
    return settlementId;
  }

  /** Commit a durable settlement batch to payment history. */
  async commitSettlement(settlementId: string): Promise<void> {
    const committed = await this.storage.commitPaymentSettlement(settlementId);
    if (!committed) throw new Error('Payment settlement batch was not found');
  }

  /** Release a durable settlement batch after payment definitively fails. */
  async releaseSettlement(settlementId: string): Promise<void> {
    await this.storage.releasePaymentSettlement(settlementId);
  }

  async releaseReservation(reservationId: string): Promise<void> {
    await this.storage.releasePaymentReservation(reservationId);
  }

  /**
   * Checks if an outgoing payment limit would be exceeded.
   * @param groupName - Policy group name
   * @param scope - Scope key ("global", target URL, or endpoint URL)
   * @param maxTotalUsd - Maximum total spending in USD
   * @param windowMs - Optional time window in milliseconds (if not provided, lifetime limit)
   * @param requestedAmount - Amount requested in base units (USDC has 6 decimals)
   * @returns Result indicating if allowed and current total
   */
  async checkOutgoingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    requestedAmount: bigint
  ): Promise<{ allowed: boolean; reason?: string; currentTotal?: bigint }> {
    const maxTotalBaseUnits = BigInt(Math.floor(maxTotalUsd * 1_000_000));

    const currentTotal = await this.storage.getTotal(
      groupName,
      scope,
      'outgoing',
      windowMs
    );

    const newTotal = currentTotal + requestedAmount;
    if (newTotal > maxTotalBaseUnits) {
      return {
        allowed: false,
        reason: `Total outgoing payment limit exceeded for policy group "${groupName}" at scope "${scope}". Current: ${formatUsdcAmount(currentTotal)} USDC, Requested: ${formatUsdcAmount(requestedAmount)} USDC, Limit: ${maxTotalUsd} USDC`,
        currentTotal,
      };
    }

    return {
      allowed: true,
      currentTotal,
    };
  }

  /**
   * Checks if an incoming payment limit would be exceeded.
   * @param groupName - Policy group name
   * @param scope - Scope key ("global", sender address, or endpoint URL)
   * @param maxTotalUsd - Maximum total incoming in USD
   * @param windowMs - Optional time window in milliseconds (if not provided, lifetime limit)
   * @param requestedAmount - Amount requested in base units (USDC has 6 decimals)
   * @returns Result indicating if allowed and current total
   */
  async checkIncomingLimit(
    groupName: string,
    scope: string,
    maxTotalUsd: number,
    windowMs: number | undefined,
    requestedAmount: bigint
  ): Promise<{ allowed: boolean; reason?: string; currentTotal?: bigint }> {
    const maxTotalBaseUnits = BigInt(Math.floor(maxTotalUsd * 1_000_000));

    const currentTotal = await this.storage.getTotal(
      groupName,
      scope,
      'incoming',
      windowMs
    );

    const newTotal = currentTotal + requestedAmount;
    if (newTotal > maxTotalBaseUnits) {
      return {
        allowed: false,
        reason: `Total incoming payment limit exceeded for policy group "${groupName}" at scope "${scope}". Current: ${formatUsdcAmount(currentTotal)} USDC, Requested: ${formatUsdcAmount(requestedAmount)} USDC, Limit: ${maxTotalUsd} USDC`,
        currentTotal,
      };
    }

    return {
      allowed: true,
      currentTotal,
    };
  }

  /**
   * Records an outgoing payment after a successful payment.
   * @param groupName - Policy group name
   * @param scope - Scope key ("global", target URL, or endpoint URL)
   * @param amount - Amount spent in base units
   */
  async recordOutgoing(
    groupName: string,
    scope: string,
    amount: bigint
  ): Promise<void> {
    await this.storage.recordPayment({
      groupName,
      scope,
      direction: 'outgoing',
      amount,
    });
  }

  /**
   * Records an incoming payment after a successful payment.
   * @param groupName - Policy group name
   * @param scope - Scope key ("global", sender address, or endpoint URL)
   * @param amount - Amount received in base units
   */
  async recordIncoming(
    groupName: string,
    scope: string,
    amount: bigint
  ): Promise<void> {
    await this.storage.recordPayment({
      groupName,
      scope,
      direction: 'incoming',
      amount,
    });
  }

  /**
   * Gets the current total outgoing payments for a scope (for informational purposes).
   * @param groupName - Policy group name
   * @param scope - Scope key
   * @param windowMs - Optional time window to filter entries
   * @returns Current total in base units
   */
  async getOutgoingTotal(
    groupName: string,
    scope: string,
    windowMs?: number
  ): Promise<bigint> {
    return await this.storage.getTotal(groupName, scope, 'outgoing', windowMs);
  }

  /**
   * Gets the current total incoming payments for a scope (for informational purposes).
   * @param groupName - Policy group name
   * @param scope - Scope key
   * @param windowMs - Optional time window to filter entries
   * @returns Current total in base units
   */
  async getIncomingTotal(
    groupName: string,
    scope: string,
    windowMs?: number
  ): Promise<bigint> {
    return await this.storage.getTotal(groupName, scope, 'incoming', windowMs);
  }

  /**
   * Gets all payment data (both outgoing and incoming).
   * @returns Array of all payment records
   */
  async getAllData() {
    return (await this.storage.getAllRecords()).filter(
      record => !record.groupName.startsWith(RATE_RESERVATION_PREFIX)
    );
  }

  /**
   * Clears all payment data (useful for testing or reset).
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  async close(): Promise<void> {
    await this.storage.close?.();
  }
}

/**
 * Creates a new payment tracker instance.
 * Defaults to portable in-memory storage if no storage is provided.
 * @param storage - Optional storage implementation (defaults to in-memory)
 * @returns A new PaymentTracker instance
 */
export function createPaymentTracker(storage?: PaymentStorage): PaymentTracker {
  const storageImpl = storage ?? createInMemoryPaymentStorage();
  return new PaymentTracker(storageImpl);
}
