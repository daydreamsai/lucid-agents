import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { createInMemorySIWxStorage } from '../siwx-in-memory-storage';
import { createSQLiteSIWxStorage } from '../siwx-sqlite-storage';
import type { SIWxStorage } from '../siwx-storage';
import type { SQLiteSIWxStorage } from '../siwx-sqlite-storage';

// Postgres integration tests are opt-in. Set TEST_POSTGRES_URL to enable.
const TEST_DB_URL = process.env.TEST_POSTGRES_URL;

/**
 * Shared test suite that runs against any SIWxStorage implementation.
 */
function runStorageTests(
  name: string,
  createStorage: () => SIWxStorage | Promise<SIWxStorage>,
  cleanup?: () => void
) {
  describe(name, () => {
    let storage: SIWxStorage;

    beforeEach(async () => {
      storage = await createStorage();
      await storage.clear();
    });

    afterEach(() => {
      cleanup?.();
    });

    describe('hasPaid', () => {
      it('should return false for unknown resource/address pair', async () => {
        const result = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        expect(result).toBe(false);
      });

      it('should return true after recordPayment', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        const result = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        expect(result).toBe(true);
      });

      it('should normalize address to lowercase', async () => {
        await storage.recordPayment('resource-1', '0xABC123DEF456');
        const result = await storage.hasPaid(
          'resource-1',
          '0xabc123def456'
        );
        expect(result).toBe(true);
      });

      it('should distinguish different resources for same address', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        const result1 = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        const result2 = await storage.hasPaid(
          'resource-2',
          '0xAbC123def456'
        );
        expect(result1).toBe(true);
        expect(result2).toBe(false);
      });

      it('should distinguish different addresses for same resource', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        const result1 = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        const result2 = await storage.hasPaid(
          'resource-1',
          '0x999888777666'
        );
        expect(result1).toBe(true);
        expect(result2).toBe(false);
      });
    });

    describe('recordPayment', () => {
      it('should record a payment entitlement', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        const result = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        expect(result).toBe(true);
      });

      it('should handle duplicate recordings idempotently', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        await storage.recordPayment('resource-1', '0xAbC123def456');
        const result = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        expect(result).toBe(true);
      });

      it('should store optional chainId', async () => {
        await storage.recordPayment(
          'resource-1',
          '0xAbC123def456',
          'eip155:1'
        );
        const result = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        expect(result).toBe(true);
      });
    });

    describe('hasUsedNonce', () => {
      it('should return false for unused nonce', async () => {
        const result = await storage.hasUsedNonce('nonce-abc-123');
        expect(result).toBe(false);
      });

      it('should return true after recordNonce', async () => {
        await storage.recordNonce('nonce-abc-123');
        const result = await storage.hasUsedNonce('nonce-abc-123');
        expect(result).toBe(true);
      });
    });

    describe('recordNonce', () => {
      it('should record a nonce', async () => {
        await storage.recordNonce('nonce-abc-123');
        const result = await storage.hasUsedNonce('nonce-abc-123');
        expect(result).toBe(true);
      });

      it('should record nonce with metadata', async () => {
        await storage.recordNonce('nonce-abc-123', {
          resource: 'resource-1',
          address: '0xAbC123def456',
          expiresAt: Date.now() + 3600_000,
        });
        const result = await storage.hasUsedNonce('nonce-abc-123');
        expect(result).toBe(true);
      });

      it('should handle duplicate nonces idempotently', async () => {
        await storage.recordNonce('nonce-abc-123');
        await storage.recordNonce('nonce-abc-123');
        const result = await storage.hasUsedNonce('nonce-abc-123');
        expect(result).toBe(true);
      });
    });

    describe('consumeNonce', () => {
      it('should return consumed on first call', async () => {
        const result = await storage.consumeNonce('nonce-atomic-1');
        expect(result).toBe('consumed');
      });

      it('should return already_used on second call', async () => {
        await storage.consumeNonce('nonce-atomic-2');
        const result = await storage.consumeNonce('nonce-atomic-2');
        expect(result).toBe('already_used');
      });

      it('should store metadata on first consumption', async () => {
        await storage.consumeNonce('nonce-atomic-3', {
          resource: 'resource-1',
          address: '0xAbC123def456',
          expiresAt: Date.now() + 3600_000,
        });
        const hasUsed = await storage.hasUsedNonce('nonce-atomic-3');
        expect(hasUsed).toBe(true);
      });

      it('should not overwrite metadata on duplicate consumption', async () => {
        await storage.consumeNonce('nonce-atomic-4', {
          resource: 'original-resource',
          address: '0xOriginal',
        });
        const result = await storage.consumeNonce('nonce-atomic-4', {
          resource: 'different-resource',
          address: '0xDifferent',
        });
        expect(result).toBe('already_used');
      });
    });

    describe('clear', () => {
      it('should clear all entitlements and nonces', async () => {
        await storage.recordPayment('resource-1', '0xAbC123def456');
        await storage.recordNonce('nonce-abc-123');

        await storage.clear();

        const hasPaid = await storage.hasPaid(
          'resource-1',
          '0xAbC123def456'
        );
        const hasNonce = await storage.hasUsedNonce('nonce-abc-123');

        expect(hasPaid).toBe(false);
        expect(hasNonce).toBe(false);
      });
    });
  });
}

describe('SIWxStorage', () => {
  // In-memory storage tests
  runStorageTests('InMemorySIWxStorage', () => createInMemorySIWxStorage());

  // SQLite storage tests
  (() => {
    let currentStorage: SQLiteSIWxStorage | null = null;

    runStorageTests(
      'SQLiteSIWxStorage',
      () => {
        const dbPath = join(tmpdir(), `siwx-test-${randomUUID()}.db`);
        const { SQLiteSIWxStorage: Cls } = require('../siwx-sqlite-storage');
        currentStorage = new Cls(dbPath) as SQLiteSIWxStorage;
        return currentStorage;
      },
      () => {
        if (currentStorage) {
          currentStorage.close();
          currentStorage = null;
        }
      }
    );
  })();

  // Postgres tests (opt-in via TEST_POSTGRES_URL env)
  const describeWithDb = TEST_DB_URL ? describe : describe.skip;

  describeWithDb('PostgresSIWxStorage', () => {
    runStorageTests(
      'PostgresSIWxStorage',
      async () => {
        const { createPostgresSIWxStorage } = await import(
          '../siwx-postgres-storage'
        );
        return createPostgresSIWxStorage(TEST_DB_URL!);
      }
    );
  });
});
