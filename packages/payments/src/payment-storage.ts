import type {
  PaymentDirection,
  PaymentRecord,
} from '@lucid-agents/types/payments';

export type PaymentLimitReservation = {
  groupName: string;
  scope: string;
  direction: PaymentDirection;
  amount: bigint;
  maxTotal: bigint;
  windowMs?: number;
  ttlMs: number;
};

export type PaymentLimitReservationResult =
  | { allowed: true; reservationId: string }
  | { allowed: false };

export type PaymentAccountingRecord = Omit<PaymentRecord, 'id' | 'timestamp'>;

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

  /** Atomically reserve capacity below a total limit. */
  reservePaymentLimit(
    reservation: PaymentLimitReservation
  ): Promise<PaymentLimitReservationResult>;

  /** Atomically turn a live reservation into a payment record. */
  commitPaymentReservation(reservationId: string): Promise<boolean>;

  /**
   * Atomically commit every reservation and additional history record, or
   * commit none of them when any reservation is missing or expired.
   */
  commitPaymentReservations(
    reservationIds: readonly string[],
    records?: readonly PaymentAccountingRecord[]
  ): Promise<boolean>;

  /**
   * Atomically move live reservations and additional accounting records into
   * a durable, non-expiring settlement batch before payment is attempted.
   */
  stagePaymentSettlement(
    reservationIds: readonly string[],
    records?: readonly PaymentAccountingRecord[]
  ): Promise<string | undefined>;

  /** Atomically turn a staged settlement batch into payment history. */
  commitPaymentSettlement(settlementId: string): Promise<boolean>;

  /** Release a staged settlement batch after payment definitively fails. */
  releasePaymentSettlement(settlementId: string): Promise<void>;

  /** Release a reservation without recording a payment. */
  releasePaymentReservation(reservationId: string): Promise<void>;

  /**
   * Clears all payment data (useful for testing or reset).
   */
  clear(): Promise<void>;
  /** Release persistent storage resources. */
  close?(): Promise<void> | void;
}
