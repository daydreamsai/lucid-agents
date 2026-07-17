import type {
  PaymentRecord,
  PaymentDirection,
} from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';
import type {
  PaymentAccountingRecord,
  PaymentLimitReservation,
  PaymentLimitReservationResult,
} from './payment-storage';

type PaymentEntry = {
  amount: bigint;
  timestamp: number;
};

type ScopeKey = string;
type StagedPaymentEntry = PaymentAccountingRecord & { timestamp: number };

/**
 * In-memory payment storage using Map data structure.
 * Data is ephemeral (lost on restart/invocation).
 * Useful for serverless without file access, testing, temporary tracking.
 */
export class InMemoryPaymentStorage implements PaymentStorage {
  private payments: Map<string, Map<ScopeKey, PaymentEntry[]>> = new Map();
  private reservations = new Map<
    string,
    PaymentLimitReservation & { timestamp: number; expiresAt: number }
  >();
  private settlements = new Map<string, StagedPaymentEntry[]>();
  private operationQueue: Promise<void> = Promise.resolve();

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release: () => void = () => {};
    this.operationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private appendPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>,
    timestamp = Date.now()
  ): void {
    const key = `${record.groupName}:${record.direction}`;
    let groupPayments = this.payments.get(key);
    if (!groupPayments) {
      groupPayments = new Map();
      this.payments.set(key, groupPayments);
    }

    let entries = groupPayments.get(record.scope);
    if (!entries) {
      entries = [];
      groupPayments.set(record.scope, entries);
    }

    entries.push({ amount: record.amount, timestamp });
  }

  async recordPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    await this.withLock(() => {
      this.appendPayment(record);
    });
  }

  async reservePaymentLimit(
    reservation: PaymentLimitReservation
  ): Promise<PaymentLimitReservationResult> {
    return this.withLock(() => {
      const now = Date.now();
      for (const [id, pending] of this.reservations) {
        if (pending.expiresAt <= now) this.reservations.delete(id);
      }
      const cutoff =
        reservation.windowMs === undefined
          ? undefined
          : now - reservation.windowMs;
      const paymentKey = `${reservation.groupName}:${reservation.direction}`;
      const recorded =
        this.payments
          .get(paymentKey)
          ?.get(reservation.scope)
          ?.filter(entry => cutoff === undefined || entry.timestamp > cutoff)
          .reduce((total, entry) => total + entry.amount, 0n) ?? 0n;
      let pending = 0n;
      for (const candidate of this.reservations.values()) {
        if (
          candidate.groupName === reservation.groupName &&
          candidate.scope === reservation.scope &&
          candidate.direction === reservation.direction &&
          (cutoff === undefined || candidate.timestamp > cutoff)
        ) {
          pending += candidate.amount;
        }
      }
      for (const entries of this.settlements.values()) {
        for (const candidate of entries) {
          if (
            candidate.groupName === reservation.groupName &&
            candidate.scope === reservation.scope &&
            candidate.direction === reservation.direction &&
            (cutoff === undefined || candidate.timestamp > cutoff)
          ) {
            pending += candidate.amount;
          }
        }
      }
      if (recorded + pending + reservation.amount > reservation.maxTotal) {
        return { allowed: false };
      }
      const reservationId = crypto.randomUUID();
      this.reservations.set(reservationId, {
        ...reservation,
        timestamp: now,
        expiresAt: now + reservation.ttlMs,
      });
      return { allowed: true, reservationId };
    });
  }

  async commitPaymentReservation(reservationId: string): Promise<boolean> {
    return this.commitPaymentReservations([reservationId]);
  }

  async commitPaymentReservations(
    reservationIds: readonly string[],
    records: readonly PaymentAccountingRecord[] = []
  ): Promise<boolean> {
    return this.withLock(() => {
      if (new Set(reservationIds).size !== reservationIds.length) return false;
      const now = Date.now();
      const reservations = reservationIds.map(id => this.reservations.get(id));
      if (
        reservations.some(
          reservation => !reservation || reservation.expiresAt <= now
        )
      ) {
        for (const id of reservationIds) {
          const reservation = this.reservations.get(id);
          if (reservation?.expiresAt && reservation.expiresAt <= now) {
            this.reservations.delete(id);
          }
        }
        return false;
      }
      for (const reservation of reservations) {
        this.appendPayment(
          {
            groupName: reservation!.groupName,
            scope: reservation!.scope,
            direction: reservation!.direction,
            amount: reservation!.amount,
          },
          now
        );
      }
      for (const record of records) this.appendPayment(record, now);
      for (const id of reservationIds) this.reservations.delete(id);
      return true;
    });
  }

  async stagePaymentSettlement(
    reservationIds: readonly string[],
    records: readonly PaymentAccountingRecord[] = []
  ): Promise<string | undefined> {
    return this.withLock(() => {
      if (new Set(reservationIds).size !== reservationIds.length) {
        return undefined;
      }
      const now = Date.now();
      const reservations = reservationIds.map(id => this.reservations.get(id));
      if (
        reservations.some(
          reservation => !reservation || reservation.expiresAt <= now
        )
      ) {
        for (const id of reservationIds) {
          const reservation = this.reservations.get(id);
          if (reservation?.expiresAt && reservation.expiresAt <= now) {
            this.reservations.delete(id);
          }
        }
        return undefined;
      }
      const entries: StagedPaymentEntry[] = [
        ...reservations.map(reservation => ({
          groupName: reservation!.groupName,
          scope: reservation!.scope,
          direction: reservation!.direction,
          amount: reservation!.amount,
          timestamp: now,
        })),
        ...records.map(record => ({ ...record, timestamp: now })),
      ];
      if (entries.length === 0) return undefined;

      const settlementId = crypto.randomUUID();
      this.settlements.set(settlementId, entries);
      for (const id of reservationIds) this.reservations.delete(id);
      return settlementId;
    });
  }

  async commitPaymentSettlement(settlementId: string): Promise<boolean> {
    return this.withLock(() => {
      const entries = this.settlements.get(settlementId);
      if (!entries) return false;
      for (const entry of entries) this.appendPayment(entry, entry.timestamp);
      this.settlements.delete(settlementId);
      return true;
    });
  }

  async releasePaymentSettlement(settlementId: string): Promise<void> {
    await this.withLock(() => {
      this.settlements.delete(settlementId);
    });
  }

  async releasePaymentReservation(reservationId: string): Promise<void> {
    await this.withLock(() => {
      this.reservations.delete(reservationId);
    });
  }

  async getTotal(
    groupName: string,
    scope: string,
    direction: PaymentDirection,
    windowMs?: number
  ): Promise<bigint> {
    return this.withLock(() => {
      const cutoff = windowMs === undefined ? undefined : Date.now() - windowMs;
      const key = `${groupName}:${direction}`;
      const recorded =
        this.payments
          .get(key)
          ?.get(scope)
          ?.filter(entry => cutoff === undefined || entry.timestamp > cutoff)
          .reduce((sum, entry) => sum + entry.amount, 0n) ?? 0n;
      let staged = 0n;
      for (const entries of this.settlements.values()) {
        for (const entry of entries) {
          if (
            entry.groupName === groupName &&
            entry.scope === scope &&
            entry.direction === direction &&
            (cutoff === undefined || entry.timestamp > cutoff)
          ) {
            staged += entry.amount;
          }
        }
      }
      return recorded + staged;
    });
  }

  async getAllRecords(
    groupName?: string,
    scope?: string,
    direction?: PaymentDirection,
    windowMs?: number
  ): Promise<PaymentRecord[]> {
    const records: PaymentRecord[] = [];
    const cutoff = windowMs !== undefined ? Date.now() - windowMs : undefined;

    for (const [key, groupPayments] of this.payments.entries()) {
      const lastColonIndex = key.lastIndexOf(':');
      if (lastColonIndex === -1) {
        continue;
      }

      const keyGroupName = key.substring(0, lastColonIndex);
      const keyDirection = key.substring(
        lastColonIndex + 1
      ) as PaymentDirection;

      if (groupName && keyGroupName !== groupName) {
        continue;
      }
      if (direction && keyDirection !== direction) {
        continue;
      }

      for (const [keyScope, entries] of groupPayments.entries()) {
        if (scope && keyScope !== scope) {
          continue;
        }

        const filteredEntries =
          cutoff !== undefined
            ? entries.filter(entry => entry.timestamp > cutoff)
            : entries;

        for (const entry of filteredEntries) {
          records.push({
            groupName: keyGroupName,
            scope: keyScope,
            direction: keyDirection,
            amount: entry.amount,
            timestamp: entry.timestamp,
          });
        }
      }
    }

    return Promise.resolve(records);
  }

  async clear(): Promise<void> {
    await this.withLock(() => {
      this.payments.clear();
      this.reservations.clear();
      this.settlements.clear();
    });
  }
}

/**
 * Creates a new in-memory payment storage instance.
 * @returns A new InMemoryPaymentStorage instance
 */
export function createInMemoryPaymentStorage(): PaymentStorage {
  return new InMemoryPaymentStorage();
}
