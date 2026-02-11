import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createPostgresPaymentStorage } from '../postgres-payment-storage';
import { createPaymentTracker } from '../payment-tracker';
import type { PaymentStorage } from '../payment-storage';

// Postgres integration tests are opt-in. Set TEST_POSTGRES_URL to enable.
const TEST_DB_URL = process.env.TEST_POSTGRES_URL;

// Skip tests if no database URL is provided
const describeWithDb = TEST_DB_URL ? describe : describe.skip;

describeWithDb('Multi-Agent Payment Isolation', () => {
  let storageAgentA: PaymentStorage;
  let storageAgentB: PaymentStorage;
  let storageAgentC: PaymentStorage;
  let storageNoAgent: PaymentStorage;
  let trackerA: ReturnType<typeof createPaymentTracker>;
  let trackerB: ReturnType<typeof createPaymentTracker>;
  let trackerC: ReturnType<typeof createPaymentTracker>;
  let trackerNoAgent: ReturnType<typeof createPaymentTracker>;

  const agentIdA = 'agent_a';
  const agentIdB = 'agent_b';
  const agentIdC = 'agent_c';

  beforeEach(async () => {
    storageAgentA = createPostgresPaymentStorage(TEST_DB_URL, agentIdA);
    storageAgentB = createPostgresPaymentStorage(TEST_DB_URL, agentIdB);
    storageAgentC = createPostgresPaymentStorage(TEST_DB_URL, agentIdC);
    storageNoAgent = createPostgresPaymentStorage(TEST_DB_URL);

    trackerA = createPaymentTracker(storageAgentA);
    trackerB = createPaymentTracker(storageAgentB);
    trackerC = createPaymentTracker(storageAgentC);
    trackerNoAgent = createPaymentTracker(storageNoAgent);

    // Clear all data
    await storageAgentA.clear();
    await storageAgentB.clear();
    await storageAgentC.clear();
    await storageNoAgent.clear();
  });

  afterEach(async () => {
    await storageAgentA.clear();
    await storageAgentB.clear();
    await storageAgentC.clear();
    await storageNoAgent.clear();
  });

  describe('Payment isolation', () => {
    it('should isolate outgoing payments between agents', async () => {
      // Agent A records outgoing payment
      await trackerA.recordOutgoing('group1', 'global', 1000n);

      // Agent B records outgoing payment
      await trackerB.recordOutgoing('group1', 'global', 2000n);

      // Agent C records outgoing payment
      await trackerC.recordOutgoing('group1', 'global', 3000n);

      // Each agent should only see their own total
      expect(await trackerA.getOutgoingTotal('group1', 'global')).toBe(1000n);
      expect(await trackerB.getOutgoingTotal('group1', 'global')).toBe(2000n);
      expect(await trackerC.getOutgoingTotal('group1', 'global')).toBe(3000n);
    });

    it('should isolate incoming payments between agents', async () => {
      await trackerA.recordIncoming('group1', 'global', 5000n);
      await trackerB.recordIncoming('group1', 'global', 6000n);
      await trackerC.recordIncoming('group1', 'global', 7000n);

      expect(await trackerA.getIncomingTotal('group1', 'global')).toBe(5000n);
      expect(await trackerB.getIncomingTotal('group1', 'global')).toBe(6000n);
      expect(await trackerC.getIncomingTotal('group1', 'global')).toBe(7000n);
    });

    it('should isolate payments with same group/scope names', async () => {
      const sharedGroup = 'shared-policy-group';
      const sharedScope = 'global';

      await trackerA.recordOutgoing(sharedGroup, sharedScope, 1000n);
      await trackerB.recordOutgoing(sharedGroup, sharedScope, 2000n);
      await trackerC.recordOutgoing(sharedGroup, sharedScope, 3000n);

      // Each should see only their own
      expect(await trackerA.getOutgoingTotal(sharedGroup, sharedScope)).toBe(
        1000n
      );
      expect(await trackerB.getOutgoingTotal(sharedGroup, sharedScope)).toBe(
        2000n
      );
      expect(await trackerC.getOutgoingTotal(sharedGroup, sharedScope)).toBe(
        3000n
      );
    });
  });

  describe('Limit enforcement per agent', () => {
    it('should enforce limits independently per agent', async () => {
      const maxTotalUsd = 100.0; // $0.10 limit
      const groupName = 'daily-limit-group';

      // Agent A uses up most of its limit
      const resultA1 = await trackerA.checkOutgoingLimit(
        groupName,
        'global',
        maxTotalUsd,
        undefined,
        80_000_000n // $0.08
      );
      expect(resultA1.allowed).toBe(true);
      await trackerA.recordOutgoing(groupName, 'global', 80_000_000n);

      // Agent B should still be able to make payments (separate limit)
      const resultB1 = await trackerB.checkOutgoingLimit(
        groupName,
        'global',
        maxTotalUsd,
        undefined,
        90_000_000n // $0.09
      );
      expect(resultB1.allowed).toBe(true);
      await trackerB.recordOutgoing(groupName, 'global', 90_000_000n);

      // Agent A should now be blocked (over its limit)
      const resultA2 = await trackerA.checkOutgoingLimit(
        groupName,
        'global',
        maxTotalUsd,
        undefined,
        25_000_000n // $0.025, would exceed $0.10 total
      );
      expect(resultA2.allowed).toBe(false);

      // Agent B should still be able to make small payments
      const resultB2 = await trackerB.checkOutgoingLimit(
        groupName,
        'global',
        maxTotalUsd,
        undefined,
        5_000_000n // $0.005, still under $0.10
      );
      expect(resultB2.allowed).toBe(true);
    });

    it('should enforce per-target limits independently per agent', async () => {
      const targetUrl = 'https://target.example.com';
      const maxTotalUsd = 50.0; // $0.05 limit per target

      // Agent A pays target
      await trackerA.recordOutgoing(
        'group1',
        `per-target:${targetUrl}`,
        30_000_000n
      );

      // Agent B should still be able to pay same target (separate tracking)
      const resultB = await trackerB.checkOutgoingLimit(
        'group1',
        `per-target:${targetUrl}`,
        maxTotalUsd,
        undefined,
        20_000_000n
      );
      expect(resultB.allowed).toBe(true);

      // Agent A should be blocked (over its per-target limit)
      const resultA = await trackerA.checkOutgoingLimit(
        'group1',
        `per-target:${targetUrl}`,
        maxTotalUsd,
        undefined,
        25_000_000n
      );
      expect(resultA.allowed).toBe(false);
    });
  });

  describe('Analytics per agent', () => {
    it('should return correct transaction data per agent', async () => {
      // Record various payments for each agent
      await trackerA.recordOutgoing('group1', 'global', 1000n);
      await trackerA.recordIncoming('group1', 'global', 2000n);
      await trackerA.recordOutgoing(
        'group2',
        'per-target:https://example.com',
        3000n
      );

      await trackerB.recordOutgoing('group1', 'global', 4000n);
      await trackerB.recordOutgoing('group3', 'global', 5000n);

      await trackerC.recordIncoming('group1', 'global', 6000n);

      // Each agent should see only their own records
      const recordsA = await storageAgentA.getAllRecords();
      expect(recordsA).toHaveLength(3);
      expect(
        recordsA.every(
          r => r.groupName === 'group1' || r.groupName === 'group2'
        )
      ).toBe(true);

      const recordsB = await storageAgentB.getAllRecords();
      expect(recordsB).toHaveLength(2);
      expect(
        recordsB.every(
          r => r.groupName === 'group1' || r.groupName === 'group3'
        )
      ).toBe(true);

      const recordsC = await storageAgentC.getAllRecords();
      expect(recordsC).toHaveLength(1);
      expect(recordsC[0].groupName).toBe('group1');
      expect(recordsC[0].direction).toBe('incoming');
    });

    it('should filter by group name per agent', async () => {
      await trackerA.recordOutgoing('group1', 'global', 1000n);
      await trackerA.recordOutgoing('group2', 'global', 2000n);
      await trackerB.recordOutgoing('group1', 'global', 3000n);
      await trackerB.recordOutgoing('group2', 'global', 4000n);

      const recordsA1 = await storageAgentA.getAllRecords('group1');
      expect(recordsA1).toHaveLength(1);
      expect(recordsA1[0].amount).toBe(1000n);

      const recordsB1 = await storageAgentB.getAllRecords('group1');
      expect(recordsB1).toHaveLength(1);
      expect(recordsB1[0].amount).toBe(3000n);
    });
  });

  describe('Rate limiting per agent', () => {
    it('should enforce rate limits independently per agent', async () => {
      const maxPayments = 3;
      const windowMs = 1000; // 1 second
      const groupName = 'rate-limited-group';

      // Agent A makes 3 payments (at limit)
      for (let i = 0; i < 3; i++) {
        await trackerA.recordOutgoing(groupName, 'global', 1000n);
      }

      // Agent B should still be able to make payments (separate rate limit)
      const resultB = await trackerB.checkOutgoingLimit(
        groupName,
        'global',
        100.0,
        undefined,
        1000n
      );
      expect(resultB.allowed).toBe(true);

      // Note: Rate limiting is handled by RateLimiter, not PaymentTracker
      // This test verifies that payment tracking is isolated, which is a prerequisite
      // for rate limiting to work per-agent
    });
  });

  describe('Backward compatibility with NULL agent_id', () => {
    it('should isolate NULL agent_id from specific agents', async () => {
      // Record payment without agentId
      await trackerNoAgent.recordOutgoing('group1', 'global', 1000n);

      // Record payment for agent A
      await trackerA.recordOutgoing('group1', 'global', 2000n);

      // Storage without agentId should only see NULL agent_id payments
      expect(await trackerNoAgent.getOutgoingTotal('group1', 'global')).toBe(
        1000n
      );

      // Agent A should only see its own payments
      expect(await trackerA.getOutgoingTotal('group1', 'global')).toBe(2000n);
    });

    it('should allow mixing NULL and non-NULL agent_id in same database', async () => {
      await trackerNoAgent.recordOutgoing('shared-group', 'global', 1000n);
      await trackerA.recordOutgoing('shared-group', 'global', 2000n);
      await trackerB.recordOutgoing('shared-group', 'global', 3000n);

      expect(
        await trackerNoAgent.getOutgoingTotal('shared-group', 'global')
      ).toBe(1000n);
      expect(await trackerA.getOutgoingTotal('shared-group', 'global')).toBe(
        2000n
      );
      expect(await trackerB.getOutgoingTotal('shared-group', 'global')).toBe(
        3000n
      );
    });
  });
});
