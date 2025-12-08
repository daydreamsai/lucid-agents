import type { PaymentRecord, PaymentDirection } from '@lucid-agents/types/payments';
import type { PaymentStorage } from './payment-storage';

type PaymentEntry = {
  amount: bigint;
  timestamp: number;
};

type ScopeKey = string;

/**
 * In-memory payment storage using Map data structure.
 * Data is ephemeral (lost on restart/invocation).
 * Useful for serverless without file access, testing, temporary tracking.
 */
export class InMemoryPaymentStorage implements PaymentStorage {
  private payments: Map<string, Map<ScopeKey, PaymentEntry[]>> = new Map();

  async recordPayment(
    record: Omit<PaymentRecord, 'id' | 'timestamp'>
  ): Promise<void> {
    if (record.amount <= 0n) {
      return;
    }

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

    entries.push({
      amount: record.amount,
      timestamp: Date.now(),
    });
    return Promise.resolve();
  }

  async getTotal(
    groupName: string,
    scope: string,
    direction: PaymentDirection,
    windowMs?: number
  ): Promise<bigint> {
    const key = `${groupName}:${direction}`;
    const groupPayments = this.payments.get(key);
    if (!groupPayments) {
      return Promise.resolve(0n);
    }

    let entries = groupPayments.get(scope);
    if (!entries || entries.length === 0) {
      return Promise.resolve(0n);
    }

    if (windowMs !== undefined) {
      const cutoff = Date.now() - windowMs;
      entries = entries.filter(entry => entry.timestamp > cutoff);
    }

    return Promise.resolve(
      entries.reduce((sum, entry) => sum + entry.amount, 0n)
    );
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
    this.payments.clear();
    return Promise.resolve();
  }
}

/**
 * Creates a new in-memory payment storage instance.
 * @returns A new InMemoryPaymentStorage instance
 */
export function createInMemoryPaymentStorage(): PaymentStorage {
  return new InMemoryPaymentStorage();
}
