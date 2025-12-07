import type { PaymentDirection } from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';
import { createSQLitePaymentStorage } from './sqlite-payment-storage';

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
export class PaymentTracker {
  constructor(private storage: PaymentStorage) {}

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
  async recordOutgoing(groupName: string, scope: string, amount: bigint): Promise<void> {
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
  async recordIncoming(groupName: string, scope: string, amount: bigint): Promise<void> {
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
    return await this.storage.getAllRecords();
  }

  /**
   * Clears all payment data (useful for testing or reset).
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }
}

/**
 * Creates a new payment tracker instance.
 * Defaults to SQLite storage if no storage is provided.
 * @param storage - Optional storage implementation (defaults to SQLite)
 * @returns A new PaymentTracker instance
 */
export function createPaymentTracker(storage?: PaymentStorage): PaymentTracker {
  const storageImpl = storage ?? createSQLitePaymentStorage();
  return new PaymentTracker(storageImpl);
}
