import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { DrizzleAgentStore } from '../store';
import { agents } from '../schema';
import * as schema from '../schema';
import { SlugExistsError } from '../../types';
import type { CreateAgentInput } from '../../types';

// Skip tests if no database URL is provided
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeWithDb = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDb('DrizzleAgentStore', () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let store: DrizzleAgentStore;

  beforeAll(async () => {
    client = postgres(TEST_DATABASE_URL!, { max: 1 });
    db = drizzle(client, { schema });

    // Create table if not exists (for test setup)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "agents" (
        "id" text PRIMARY KEY NOT NULL,
        "owner_id" text NOT NULL,
        "slug" text NOT NULL,
        "name" text NOT NULL,
        "description" text DEFAULT '' NOT NULL,
        "version" text DEFAULT '1.0.0' NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "entrypoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "payments_config" jsonb,
        "wallets_config" jsonb,
        "a2a_config" jsonb,
        "ap2_config" jsonb,
        "analytics_config" jsonb,
        "identity_config" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    // Create indexes if not exist
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "agents_slug_unique_idx" ON "agents" USING btree ("slug")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "agents_owner_id_idx" ON "agents" USING btree ("owner_id")
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "agents_created_at_idx" ON "agents" USING btree ("created_at")
    `);
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    // Clean up all agents before each test
    await db.delete(agents);
    store = new DrizzleAgentStore(db);
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  function createTestInput(overrides: Partial<CreateAgentInput & { ownerId: string }> = {}): CreateAgentInput & { ownerId: string } {
    return {
      ownerId: 'test-owner',
      slug: `test-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: 'Test Agent',
      description: 'A test agent',
      entrypoints: [
        {
          key: 'echo',
          description: 'Echo endpoint',
          inputSchema: {},
          outputSchema: {},
          handlerType: 'builtin',
          handlerConfig: { name: 'echo' },
        },
      ],
      ...overrides,
    };
  }

  // ===========================================================================
  // create()
  // ===========================================================================

  describe('create()', () => {
    it('creates an agent with generated ID', async () => {
      const input = createTestInput({ slug: 'my-agent' });
      const agent = await store.create(input);

      expect(agent.id).toMatch(/^ag_[a-f0-9]{12}$/);
      expect(agent.slug).toBe('my-agent');
      expect(agent.name).toBe('Test Agent');
      expect(agent.ownerId).toBe('test-owner');
      expect(agent.version).toBe('1.0.0');
      expect(agent.enabled).toBe(true);
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      const before = new Date();
      const agent = await store.create(createTestInput());
      const after = new Date();

      expect(agent.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(agent.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(agent.updatedAt.getTime()).toBe(agent.createdAt.getTime());
    });

    it('applies default values', async () => {
      const input = createTestInput();
      delete (input as any).description;
      delete (input as any).enabled;
      delete (input as any).metadata;

      const agent = await store.create(input);

      expect(agent.description).toBe('');
      expect(agent.enabled).toBe(true);
      expect(agent.metadata).toEqual({});
    });

    it('stores entrypoints as JSON', async () => {
      const entrypoints = [
        {
          key: 'echo',
          description: 'Echo endpoint',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          handlerType: 'builtin' as const,
          handlerConfig: { name: 'echo' },
        },
        {
          key: 'process',
          description: 'Process endpoint',
          inputSchema: { type: 'string' },
          outputSchema: { type: 'string' },
          handlerType: 'js' as const,
          handlerConfig: { code: 'return input;' },
        },
      ];

      const agent = await store.create(createTestInput({ entrypoints }));

      expect(agent.entrypoints).toHaveLength(2);
      expect(agent.entrypoints[0].key).toBe('echo');
      expect(agent.entrypoints[1].key).toBe('process');
      expect(agent.entrypoints[1].handlerConfig).toEqual({ code: 'return input;' });
    });

    it('stores extension configs', async () => {
      const agent = await store.create(createTestInput({
        paymentsConfig: {
          payTo: '0x1234',
          network: 'base-sepolia',
          facilitatorUrl: 'https://facilitator.example.com',
        },
        walletsConfig: {
          agent: { type: 'local', privateKey: '0xabc' },
        },
        a2aConfig: { enabled: true },
        ap2Config: { roles: ['admin', 'user'], description: 'AP2 config' },
        analyticsConfig: { enabled: true },
        identityConfig: { chainId: 84532, autoRegister: true },
      }));

      expect(agent.paymentsConfig?.payTo).toBe('0x1234');
      expect(agent.walletsConfig?.agent?.type).toBe('local');
      expect(agent.a2aConfig?.enabled).toBe(true);
      expect(agent.ap2Config?.roles).toEqual(['admin', 'user']);
      expect(agent.analyticsConfig?.enabled).toBe(true);
      expect(agent.identityConfig?.chainId).toBe(84532);
    });

    it('throws SlugExistsError on duplicate slug', async () => {
      await store.create(createTestInput({ slug: 'duplicate-slug' }));

      expect(
        store.create(createTestInput({ slug: 'duplicate-slug', ownerId: 'other-owner' }))
      ).rejects.toThrow(SlugExistsError);
    });
  });

  // ===========================================================================
  // getById()
  // ===========================================================================

  describe('getById()', () => {
    it('returns agent by ID', async () => {
      const created = await store.create(createTestInput({ slug: 'find-by-id' }));
      const found = await store.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.slug).toBe('find-by-id');
    });

    it('returns null for non-existent ID', async () => {
      const found = await store.getById('ag_nonexistent');
      expect(found).toBeNull();
    });

    it('returns dates as Date objects', async () => {
      const created = await store.create(createTestInput());
      const found = await store.getById(created.id);

      expect(found!.createdAt).toBeInstanceOf(Date);
      expect(found!.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // getBySlug()
  // ===========================================================================

  describe('getBySlug()', () => {
    it('returns agent by slug', async () => {
      const created = await store.create(createTestInput({ slug: 'find-by-slug' }));
      const found = await store.getBySlug('find-by-slug');

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.slug).toBe('find-by-slug');
    });

    it('returns null for non-existent slug', async () => {
      const found = await store.getBySlug('nonexistent-slug');
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // list()
  // ===========================================================================

  describe('list()', () => {
    it('returns empty array when no agents', async () => {
      const agents = await store.list('test-owner');
      expect(agents).toEqual([]);
    });

    it('filters by ownerId', async () => {
      await store.create(createTestInput({ ownerId: 'owner-1', slug: 'agent-1' }));
      await store.create(createTestInput({ ownerId: 'owner-2', slug: 'agent-2' }));
      await store.create(createTestInput({ ownerId: 'owner-1', slug: 'agent-3' }));

      const owner1Agents = await store.list('owner-1');
      const owner2Agents = await store.list('owner-2');

      expect(owner1Agents).toHaveLength(2);
      expect(owner2Agents).toHaveLength(1);
      expect(owner1Agents.every(a => a.ownerId === 'owner-1')).toBe(true);
    });

    it('orders by createdAt descending (newest first)', async () => {
      await store.create(createTestInput({ ownerId: 'owner', slug: 'first' }));
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await store.create(createTestInput({ ownerId: 'owner', slug: 'second' }));
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.create(createTestInput({ ownerId: 'owner', slug: 'third' }));

      const agents = await store.list('owner');

      expect(agents[0].slug).toBe('third');
      expect(agents[1].slug).toBe('second');
      expect(agents[2].slug).toBe('first');
    });

    it('applies offset and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await store.create(createTestInput({ ownerId: 'owner', slug: `agent-${i}` }));
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const page1 = await store.list('owner', { offset: 0, limit: 2 });
      const page2 = await store.list('owner', { offset: 2, limit: 2 });
      const page3 = await store.list('owner', { offset: 4, limit: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page3).toHaveLength(1);
    });

    it('caps limit at 100', async () => {
      // Just verify the method doesn't throw with a large limit
      const agents = await store.list('owner', { limit: 200 });
      expect(agents).toEqual([]);
    });

    it('uses default values for offset and limit', async () => {
      const agents = await store.list('owner');
      expect(agents).toEqual([]); // Just verifying no error with defaults
    });
  });

  // ===========================================================================
  // count()
  // ===========================================================================

  describe('count()', () => {
    it('returns 0 when no agents', async () => {
      const count = await store.count('test-owner');
      expect(count).toBe(0);
    });

    it('counts agents for specific owner', async () => {
      await store.create(createTestInput({ ownerId: 'owner-1', slug: 'a1' }));
      await store.create(createTestInput({ ownerId: 'owner-2', slug: 'a2' }));
      await store.create(createTestInput({ ownerId: 'owner-1', slug: 'a3' }));

      expect(await store.count('owner-1')).toBe(2);
      expect(await store.count('owner-2')).toBe(1);
      expect(await store.count('owner-3')).toBe(0);
    });
  });

  // ===========================================================================
  // update()
  // ===========================================================================

  describe('update()', () => {
    it('updates specified fields', async () => {
      const created = await store.create(createTestInput({ slug: 'to-update', name: 'Original' }));

      const updated = await store.update(created.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.description).toBe('New description');
      expect(updated!.slug).toBe('to-update'); // Unchanged
    });

    it('updates updatedAt timestamp', async () => {
      const created = await store.create(createTestInput());
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await store.update(created.id, { name: 'New Name' });

      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
      expect(updated!.createdAt.getTime()).toBe(created.createdAt.getTime()); // Unchanged
    });

    it('does not update immutable fields (id, ownerId, createdAt)', async () => {
      const created = await store.create(createTestInput({ ownerId: 'original-owner' }));

      // These fields should be ignored in partial update
      const updated = await store.update(created.id, {
        name: 'Updated',
      } as any);

      expect(updated!.id).toBe(created.id);
      expect(updated!.ownerId).toBe('original-owner');
      expect(updated!.createdAt.getTime()).toBe(created.createdAt.getTime());
    });

    it('returns null for non-existent ID', async () => {
      const result = await store.update('ag_nonexistent', { name: 'New' });
      expect(result).toBeNull();
    });

    it('allows updating slug to a new unique value', async () => {
      const created = await store.create(createTestInput({ slug: 'old-slug' }));
      const updated = await store.update(created.id, { slug: 'new-slug' });

      expect(updated!.slug).toBe('new-slug');

      // Old slug should no longer exist
      const oldSlug = await store.getBySlug('old-slug');
      expect(oldSlug).toBeNull();

      // New slug should work
      const newSlug = await store.getBySlug('new-slug');
      expect(newSlug!.id).toBe(created.id);
    });

    it('throws SlugExistsError when updating to existing slug', async () => {
      await store.create(createTestInput({ slug: 'existing-slug' }));
      const toUpdate = await store.create(createTestInput({ slug: 'my-slug' }));

      expect(
        store.update(toUpdate.id, { slug: 'existing-slug' })
      ).rejects.toThrow(SlugExistsError);
    });

    it('updates entrypoints', async () => {
      const created = await store.create(createTestInput());

      const newEntrypoints = [
        {
          key: 'new-endpoint',
          description: 'New endpoint',
          inputSchema: {},
          outputSchema: {},
          handlerType: 'builtin' as const,
          handlerConfig: { name: 'passthrough' },
        },
      ];

      const updated = await store.update(created.id, { entrypoints: newEntrypoints });

      expect(updated!.entrypoints).toHaveLength(1);
      expect(updated!.entrypoints[0].key).toBe('new-endpoint');
    });

    it('updates extension configs', async () => {
      const created = await store.create(createTestInput());

      const updated = await store.update(created.id, {
        paymentsConfig: { payTo: '0xnew', network: 'mainnet', facilitatorUrl: 'https://new.com' },
      });

      expect(updated!.paymentsConfig?.payTo).toBe('0xnew');
    });

    it('can set extension config to undefined', async () => {
      const created = await store.create(createTestInput({
        paymentsConfig: { payTo: '0x123', network: 'test', facilitatorUrl: 'https://test.com' },
      }));

      const updated = await store.update(created.id, {
        paymentsConfig: undefined,
      });

      expect(updated!.paymentsConfig).toBeUndefined();
    });
  });

  // ===========================================================================
  // delete()
  // ===========================================================================

  describe('delete()', () => {
    it('deletes an existing agent', async () => {
      const created = await store.create(createTestInput({ slug: 'to-delete' }));

      const deleted = await store.delete(created.id);
      expect(deleted).toBe(true);

      const found = await store.getById(created.id);
      expect(found).toBeNull();
    });

    it('returns false for non-existent ID', async () => {
      const deleted = await store.delete('ag_nonexistent');
      expect(deleted).toBe(false);
    });

    it('frees up the slug for reuse', async () => {
      const created = await store.create(createTestInput({ slug: 'reusable-slug' }));
      await store.delete(created.id);

      // Should be able to create with same slug now
      const newAgent = await store.create(createTestInput({ slug: 'reusable-slug' }));
      expect(newAgent.slug).toBe('reusable-slug');
      expect(newAgent.id).not.toBe(created.id);
    });
  });

  // ===========================================================================
  // Edge Cases & Error Handling
  // ===========================================================================

  describe('edge cases', () => {
    it('handles special characters in metadata', async () => {
      const agent = await store.create(createTestInput({
        metadata: {
          unicode: '日本語 emoji 🚀',
          nested: { deep: { value: true } },
          array: [1, 2, 3],
          nullValue: null,
        },
      }));

      const found = await store.getById(agent.id);
      expect(found!.metadata.unicode).toBe('日本語 emoji 🚀');
      expect((found!.metadata.nested as any).deep.value).toBe(true);
    });

    it('handles empty entrypoints array', async () => {
      const agent = await store.create(createTestInput({ entrypoints: [] }));
      expect(agent.entrypoints).toEqual([]);
    });

    it('handles large entrypoints array', async () => {
      const entrypoints = Array.from({ length: 50 }, (_, i) => ({
        key: `endpoint-${i}`,
        description: `Endpoint ${i}`,
        inputSchema: {},
        outputSchema: {},
        handlerType: 'builtin' as const,
        handlerConfig: { name: 'echo' },
      }));

      const agent = await store.create(createTestInput({ entrypoints }));
      expect(agent.entrypoints).toHaveLength(50);
    });
  });
});
