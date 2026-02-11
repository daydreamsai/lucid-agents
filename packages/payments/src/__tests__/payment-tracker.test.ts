import { describe, expect, it, beforeEach } from 'bun:test';
import { createPaymentTracker } from '../payment-tracker';
import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createPostgresPaymentStorage } from '../postgres-payment-storage';

// Postgres integration tests are opt-in. Set TEST_POSTGRES_URL to enable.
const TEST_DB_URL = process.env.TEST_POSTGRES_URL;

describe('PaymentTracker', () => {
  let tracker: ReturnType<typeof createPaymentTracker>;

  beforeEach(() => {
    const storage = createInMemoryPaymentStorage();
    tracker = createPaymentTracker(storage);
  });

  describe('checkOutgoingLimit', () => {
    it('should allow outgoing payment within limit', async () => {
      const result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block outgoing payment over limit', async () => {
      const result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        150_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });

    it('should track outgoing payments across multiple requests', async () => {
      const result1 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result1.allowed).toBe(true);
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      const result2 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        30_000_000n
      );
      expect(result2.allowed).toBe(true);
      await tracker.recordOutgoing('group1', 'global', 30_000_000n);

      const result3 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        25_000_000n
      );
      expect(result3.allowed).toBe(false);
    });

    it('should enforce time window limits for getOutgoingTotal', async () => {
      const windowMs = 100;

      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      let total = await tracker.getOutgoingTotal('group1', 'global', windowMs);
      expect(total).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      total = await tracker.getOutgoingTotal('group1', 'global', windowMs);
      expect(total).toBe(0n);
    });

    it('should enforce time window limits for checkOutgoingLimit', async () => {
      const windowMs = 100;
      const maxTotalUsd = 100.0;

      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      let result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(0n);
    });

    it('should enforce time window limits for getIncomingTotal', async () => {
      const windowMs = 100;

      await tracker.recordIncoming('group1', 'global', 50_000_000n);

      let total = await tracker.getIncomingTotal('group1', 'global', windowMs);
      expect(total).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      total = await tracker.getIncomingTotal('group1', 'global', windowMs);
      expect(total).toBe(0n);
    });

    it('should enforce time window limits for checkIncomingLimit', async () => {
      const windowMs = 100;
      const maxTotalUsd = 100.0;

      await tracker.recordIncoming('group1', 'global', 50_000_000n);

      let result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(0n);
    });

    it('should track outgoing payments per scope', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      const globalTotal = await tracker.getOutgoingTotal('group1', 'global');
      expect(globalTotal).toBe(50_000_000n);

      await tracker.recordOutgoing(
        'group1',
        'https://target.example.com',
        30_000_000n
      );
      const targetTotal = await tracker.getOutgoingTotal(
        'group1',
        'https://target.example.com'
      );
      expect(targetTotal).toBe(30_000_000n);

      expect(await tracker.getOutgoingTotal('group1', 'global')).toBe(
        50_000_000n
      );
    });

    it('should track zero-amount outgoing transactions', async () => {
      await tracker.recordOutgoing('group1', 'global', 0n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);

      // Verify the transaction is actually recorded
      const allData = await tracker.getAllData();
      const zeroAmountRecords = allData.filter(
        r => r.groupName === 'group1' && r.scope === 'global' && r.direction === 'outgoing' && r.amount === 0n
      );
      expect(zeroAmountRecords).toHaveLength(1);
      expect(zeroAmountRecords[0].amount).toBe(0n);
    });

    it('should clear all data', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      await tracker.clear();
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);
    });
  });

  describe('recordOutgoing', () => {
    it('should record outgoing payment correctly', async () => {
      await tracker.recordOutgoing('group1', 'global', 100_000_000n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate outgoing payments', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      await tracker.recordOutgoing('group1', 'global', 30_000_000n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });

    it('should track zero-amount outgoing transactions', async () => {
      await tracker.recordOutgoing('group1', 'global', 0n);
      const allData = await tracker.getAllData();
      const zeroRecords = allData.filter(
        r => r.groupName === 'group1' && r.direction === 'outgoing' && r.amount === 0n
      );
      expect(zeroRecords).toHaveLength(1);
    });

    it('should track zero-amount transactions mixed with non-zero amounts', async () => {
      await tracker.recordOutgoing('group1', 'global', 100_000_000n);
      await tracker.recordOutgoing('group1', 'global', 0n);
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      await tracker.recordOutgoing('group1', 'global', 0n);

      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(150_000_000n);

      const allData = await tracker.getAllData();
      const group1Records = allData.filter(r => r.groupName === 'group1' && r.direction === 'outgoing');
      expect(group1Records).toHaveLength(4);
      const zeroRecords = group1Records.filter(r => r.amount === 0n);
      expect(zeroRecords).toHaveLength(2);
    });
  });

  describe('recordIncoming', () => {
    it('should record incoming payment correctly', async () => {
      await tracker.recordIncoming('group1', 'global', 100_000_000n);
      const total = await tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate incoming payments', async () => {
      await tracker.recordIncoming('group1', 'global', 50_000_000n);
      await tracker.recordIncoming('group1', 'global', 30_000_000n);
      const total = await tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });

    it('should track zero-amount incoming transactions', async () => {
      await tracker.recordIncoming('group1', 'global', 0n);
      const allData = await tracker.getAllData();
      const zeroRecords = allData.filter(
        r => r.groupName === 'group1' && r.direction === 'incoming' && r.amount === 0n
      );
      expect(zeroRecords).toHaveLength(1);
    });

    it('should track zero-amount incoming transactions mixed with non-zero amounts', async () => {
      await tracker.recordIncoming('group1', 'global', 100_000_000n);
      await tracker.recordIncoming('group1', 'global', 0n);
      await tracker.recordIncoming('group1', 'global', 50_000_000n);

      const total = await tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(150_000_000n);

      const allData = await tracker.getAllData();
      const group1Records = allData.filter(r => r.groupName === 'group1' && r.direction === 'incoming');
      expect(group1Records).toHaveLength(3);
      const zeroRecords = group1Records.filter(r => r.amount === 0n);
      expect(zeroRecords).toHaveLength(1);
    });
  });

  describe('checkIncomingLimit', () => {
    it('should allow incoming payment within limit', async () => {
      const result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
    });

    it('should block incoming payment over limit', async () => {
      const result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        150_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });
  });

  describe('group names with colons', () => {
    it('should handle group names containing colons correctly', async () => {
      const groupNameWithColon = 'group:name:with:colons';
      await tracker.recordOutgoing(groupNameWithColon, 'global', 50_000_000n);
      const total = await tracker.getOutgoingTotal(
        groupNameWithColon,
        'global'
      );
      expect(total).toBe(50_000_000n);

      const allRecords = await tracker.getAllData();
      const matchingRecords = allRecords.filter(
        r => r.groupName === groupNameWithColon
      );
      expect(matchingRecords.length).toBe(1);
      expect(matchingRecords[0].direction).toBe('outgoing');
      expect(matchingRecords[0].amount).toBe(50_000_000n);
    });
  });

  // Skip Postgres tests if no database URL is provided
  const describeWithDb = TEST_DB_URL ? describe : describe.skip;

  describeWithDb('with Postgres storage and agentId', () => {
    let trackerWithAgent: ReturnType<typeof createPaymentTracker>;
    let trackerWithoutAgent: ReturnType<typeof createPaymentTracker>;
    const agentId = 'test-agent-123';

    beforeEach(async () => {
      const storageWithAgent = createPostgresPaymentStorage(TEST_DB_URL!, agentId);
      const storageWithoutAgent = createPostgresPaymentStorage(TEST_DB_URL!);
      trackerWithAgent = createPaymentTracker(storageWithAgent);
      trackerWithoutAgent = createPaymentTracker(storageWithoutAgent);

      // Clear all data
      await storageWithAgent.clear();
      await storageWithoutAgent.clear();
    });

    it('should track outgoing payments per agent', async () => {
      // Record payment for agent
      await trackerWithAgent.recordOutgoing('group1', 'global', 1000n);

      const total = await trackerWithAgent.getOutgoingTotal('group1', 'global');
      expect(total).toBe(1000n);

      // Storage without agentId should not see this payment
      const totalWithoutAgent = await trackerWithoutAgent.getOutgoingTotal(
        'group1',
        'global'
      );
      expect(totalWithoutAgent).toBe(0n);
    });

    it('should track incoming payments per agent', async () => {
      await trackerWithAgent.recordIncoming('group1', 'global', 2000n);

      const total = await trackerWithAgent.getIncomingTotal('group1', 'global');
      expect(total).toBe(2000n);

      const totalWithoutAgent = await trackerWithoutAgent.getIncomingTotal(
        'group1',
        'global'
      );
      expect(totalWithoutAgent).toBe(0n);
    });

    it('should check outgoing limits per agent', async () => {
      const result = await trackerWithAgent.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);

      await trackerWithAgent.recordOutgoing('group1', 'global', 50_000_000n);

      // Should still allow more for this agent
      const result2 = await trackerWithAgent.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        30_000_000n
      );
      expect(result2.allowed).toBe(true);
    });

    it('should isolate limits between agents', async () => {
      const agentId2 = 'test-agent-456';
      const storage2 = createPostgresPaymentStorage(TEST_DB_URL!, agentId2);
      const tracker2 = createPaymentTracker(storage2);

      // Agent 1 records payment
      await trackerWithAgent.recordOutgoing('shared-group', 'global', 50_000_000n);

      // Agent 2 should still be able to make payments (separate tracking)
      const result = await tracker2.checkOutgoingLimit(
        'shared-group',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);

      // Agent 1 should see its own total
      const total1 = await trackerWithAgent.getOutgoingTotal(
        'shared-group',
        'global'
      );
      expect(total1).toBe(50_000_000n);

      // Agent 2 should see 0 (no payments yet)
      const total2 = await tracker2.getOutgoingTotal('shared-group', 'global');
      expect(total2).toBe(0n);
    });
  });
});
