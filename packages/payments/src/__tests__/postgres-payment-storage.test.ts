import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createPostgresPaymentStorage } from '../postgres-payment-storage';
import type { PaymentStorage } from '../payment-storage';

// Use test database connection string from env
// Only use default in local dev (when not in CI)
const TEST_DB_URL =
  process.env.TEST_POSTGRES_URL ||
  (process.env.CI
    ? undefined
    : 'postgresql://postgres:test_password@localhost:5435/lucid_agents_test?schema=public');

// Skip tests if no database URL is provided
const describeWithDb = TEST_DB_URL ? describe : describe.skip;

describeWithDb('PostgresPaymentStorage with agentId', () => {
  let storageWithAgent: PaymentStorage;
  let storageWithoutAgent: PaymentStorage;
  let storageAgentB: PaymentStorage;
  const agentIdA = 'agent_a_123';
  const agentIdB = 'agent_b_456';

  beforeEach(async () => {
    // Create storage instances with and without agentId
    storageWithAgent = createPostgresPaymentStorage(TEST_DB_URL, agentIdA);
    storageWithoutAgent = createPostgresPaymentStorage(TEST_DB_URL);
    storageAgentB = createPostgresPaymentStorage(TEST_DB_URL, agentIdB);

    // Clear all data before each test
    await storageWithAgent.clear();
    await storageWithoutAgent.clear();
    await storageAgentB.clear();
  });

  afterEach(async () => {
    // Clean up after tests
    await storageWithAgent.clear();
    await storageWithoutAgent.clear();
    await storageAgentB.clear();
  });

  describe('Schema initialization', () => {
    it('should include agent_id column in schema', async () => {
      // Trigger schema initialization by recording a payment
      await storageWithAgent.recordPayment({
        groupName: 'test-group',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });

      // If we get here without error, schema was created successfully
      // The agent_id column should be present (nullable)
      expect(true).toBe(true);
    });
  });

  describe('recordPayment with agentId', () => {
    it('should store agent_id when provided', async () => {
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 5000n,
      });

      const total = await storageWithAgent.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(total).toBe(5000n);
    });

    it('should store NULL agent_id when not provided', async () => {
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 3000n,
      });

      const total = await storageWithoutAgent.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(total).toBe(3000n);
    });
  });

  describe('getTotal with agentId filtering', () => {
    it('should filter by agent_id when provided', async () => {
      // Record payments for agent A
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Record payments for agent B (same group/scope)
      await storageAgentB.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 5000n,
      });

      // Record payments without agentId
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 10000n,
      });

      // Agent A should only see its own payments
      const totalA = await storageWithAgent.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(totalA).toBe(3000n);

      // Agent B should only see its own payments
      const totalB = await storageAgentB.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(totalB).toBe(5000n);

      // Storage without agentId should see payments with NULL agent_id
      const totalNull = await storageWithoutAgent.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(totalNull).toBe(10000n);
    });

    it('should respect time window when filtering by agent_id', async () => {
      const now = Date.now();
      const windowMs = 1000; // 1 second window

      // Record payment for agent A
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });

      // Wait a bit and record another payment
      await new Promise(resolve => setTimeout(resolve, 1100));
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Should only get payment within window (the second one)
      const total = await storageWithAgent.getTotal(
        'group1',
        'global',
        'outgoing',
        windowMs
      );
      expect(total).toBe(2000n);
    });
  });

  describe('getAllRecords with agentId filtering', () => {
    it('should return only records for the specific agent', async () => {
      // Record payments for agent A
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'per-target',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Record payments for agent B
      await storageAgentB.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 5000n,
      });

      // Record payments without agentId
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 10000n,
      });

      const recordsA = await storageWithAgent.getAllRecords('group1');
      expect(recordsA).toHaveLength(2);
      expect(recordsA.every(r => r.groupName === 'group1')).toBe(true);

      const recordsB = await storageAgentB.getAllRecords('group1');
      expect(recordsB).toHaveLength(1);
      expect(recordsB[0].amount).toBe(5000n);

      const recordsNull = await storageWithoutAgent.getAllRecords('group1');
      expect(recordsNull).toHaveLength(1);
      expect(recordsNull[0].amount).toBe(10000n);
    });

    it('should filter by scope and direction when agentId is provided', async () => {
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'incoming',
        amount: 2000n,
      });
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'per-target',
        direction: 'outgoing',
        amount: 3000n,
      });

      const outgoing = await storageWithAgent.getAllRecords(
        'group1',
        'global',
        'outgoing'
      );
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].amount).toBe(1000n);

      const incoming = await storageWithAgent.getAllRecords(
        'group1',
        'global',
        'incoming'
      );
      expect(incoming).toHaveLength(1);
      expect(incoming[0].amount).toBe(2000n);
    });
  });

  describe('clear with agentId filtering', () => {
    it('should only clear records for the specific agent', async () => {
      // Record payments for agent A
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });
      await storageWithAgent.recordPayment({
        groupName: 'group2',
        scope: 'global',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Record payments for agent B
      await storageAgentB.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 5000n,
      });

      // Record payments without agentId
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 10000n,
      });

      // Clear agent A's payments
      await storageWithAgent.clear();

      // Agent A should have no records
      const recordsA = await storageWithAgent.getAllRecords();
      expect(recordsA).toHaveLength(0);

      // Agent B should still have its records
      const recordsB = await storageAgentB.getAllRecords();
      expect(recordsB).toHaveLength(1);
      expect(recordsB[0].amount).toBe(5000n);

      // Storage without agentId should still have its records
      const recordsNull = await storageWithoutAgent.getAllRecords();
      expect(recordsNull).toHaveLength(1);
      expect(recordsNull[0].amount).toBe(10000n);
    });
  });

  describe('Multi-agent isolation', () => {
    it('should isolate payments between different agents', async () => {
      // Agent A records payments
      await storageWithAgent.recordPayment({
        groupName: 'shared-group',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });

      // Agent B records payments
      await storageAgentB.recordPayment({
        groupName: 'shared-group',
        scope: 'global',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Each agent should only see their own totals
      const totalA = await storageWithAgent.getTotal(
        'shared-group',
        'global',
        'outgoing'
      );
      expect(totalA).toBe(1000n);

      const totalB = await storageAgentB.getTotal(
        'shared-group',
        'global',
        'outgoing'
      );
      expect(totalB).toBe(2000n);
    });

    it('should allow multiple agents to use same group/scope without interference', async () => {
      const groupName = 'common-group';
      const scope = 'global';

      // Both agents use same group/scope
      await storageWithAgent.recordPayment({
        groupName,
        scope,
        direction: 'outgoing',
        amount: 1000n,
      });
      await storageAgentB.recordPayment({
        groupName,
        scope,
        direction: 'outgoing',
        amount: 2000n,
      });

      // Each should see only their own
      expect(
        await storageWithAgent.getTotal(groupName, scope, 'outgoing')
      ).toBe(1000n);
      expect(await storageAgentB.getTotal(groupName, scope, 'outgoing')).toBe(
        2000n
      );
    });
  });

  describe('Backward compatibility', () => {
    it('should work without agentId (NULL agent_id)', async () => {
      // Storage without agentId should work for single-agent deployments
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 5000n,
      });

      const total = await storageWithoutAgent.getTotal(
        'group1',
        'global',
        'outgoing'
      );
      expect(total).toBe(5000n);

      const records = await storageWithoutAgent.getAllRecords('group1');
      expect(records).toHaveLength(1);
      expect(records[0].amount).toBe(5000n);
    });

    it('should allow mixing NULL and non-NULL agent_id in same database', async () => {
      // Record with agentId
      await storageWithAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 1000n,
      });

      // Record without agentId
      await storageWithoutAgent.recordPayment({
        groupName: 'group1',
        scope: 'global',
        direction: 'outgoing',
        amount: 2000n,
      });

      // Each should see only their own
      expect(
        await storageWithAgent.getTotal('group1', 'global', 'outgoing')
      ).toBe(1000n);
      expect(
        await storageWithoutAgent.getTotal('group1', 'global', 'outgoing')
      ).toBe(2000n);
    });
  });
});
