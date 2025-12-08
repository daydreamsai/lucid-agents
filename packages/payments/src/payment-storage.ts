import type { PaymentDirection, PaymentRecord } from '@lucid-agents/types/payments';

/**
 * Interface for payment data storage.
 * Allows swapping between different storage implementations (SQLite, In-Memory, Postgres).
 */
export interface PaymentStorage {
  /**
   * Records a payment (outgoing or incoming).
   * @param record - Payment record (id and timestamp are auto-generated)
   */
  recordPayment(record: Omit<PaymentRecord, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Gets the total amount for a specific group, scope, and direction.
   * @param groupName - Policy group name
   * @param scope - Scope key ("global", target URL, or endpoint URL)
   * @param direction - Payment direction ('outgoing' or 'incoming')
   * @param windowMs - Optional time window in milliseconds (if not provided, lifetime total)
   * @returns Total amount in base units
   */
  getTotal(
    groupName: string,
    scope: string,
    direction: PaymentDirection,
    windowMs?: number
  ): Promise<bigint>;

  /**
   * Gets all payment records matching the filters.
   * @param groupName - Optional filter by policy group name
   * @param scope - Optional filter by scope
   * @param direction - Optional filter by direction
   * @param windowMs - Optional time window filter
   * @returns Array of payment records
   */
  getAllRecords(
    groupName?: string,
    scope?: string,
    direction?: PaymentDirection,
    windowMs?: number
  ): Promise<PaymentRecord[]>;

  /**
   * Clears all payment data (useful for testing or reset).
   */
  clear(): Promise<void>;
}
