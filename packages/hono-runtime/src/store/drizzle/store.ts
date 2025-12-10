import { eq, desc, sql, and, or, ilike } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  AgentStore,
  AgentDefinition,
  CreateAgentInput,
  ListOptions,
} from '../types';
import { SlugExistsError } from '../types';
import { agents } from './schema';
import type * as schema from './schema';
import { generateId, rowToDefinition } from './utils';

export class DrizzleAgentStore implements AgentStore {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Get the underlying Drizzle database instance.
   * Used for sharing the connection with payment storage.
   */
  get database(): PostgresJsDatabase<typeof schema> {
    return this.db;
  }

  async getById(id: string): Promise<AgentDefinition | null> {
    const rows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    return rows[0] ? rowToDefinition(rows[0]) : null;
  }

  async getBySlug(slug: string): Promise<AgentDefinition | null> {
    const rows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.slug, slug))
      .limit(1);

    return rows[0] ? rowToDefinition(rows[0]) : null;
  }

  async list(
    ownerId: string,
    opts: ListOptions = {}
  ): Promise<AgentDefinition[]> {
    const { offset = 0, limit = 20, search, enabled } = opts;

    const conditions = [eq(agents.ownerId, ownerId)];

    // Add enabled filter
    if (enabled !== undefined) {
      conditions.push(eq(agents.enabled, enabled));
    }

    // Add search filter (case-insensitive)
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(agents.name, searchPattern),
          ilike(agents.slug, searchPattern),
          ilike(agents.description, searchPattern)
        )!
      );
    }

    const rows = await this.db
      .select()
      .from(agents)
      .where(and(...conditions))
      .orderBy(desc(agents.createdAt))
      .offset(offset)
      .limit(Math.min(limit, 100)); // Cap at 100

    return rows.map(rowToDefinition);
  }

  async count(
    ownerId: string,
    opts: Pick<ListOptions, 'search' | 'enabled'> = {}
  ): Promise<number> {
    const { search, enabled } = opts;

    const conditions = [eq(agents.ownerId, ownerId)];

    // Add enabled filter
    if (enabled !== undefined) {
      conditions.push(eq(agents.enabled, enabled));
    }

    // Add search filter (case-insensitive)
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(agents.name, searchPattern),
          ilike(agents.slug, searchPattern),
          ilike(agents.description, searchPattern)
        )!
      );
    }

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  }

  async create(
    input: CreateAgentInput & { ownerId: string }
  ): Promise<AgentDefinition> {
    const id = generateId();
    const now = new Date();

    const row: typeof agents.$inferInsert = {
      id,
      ownerId: input.ownerId,
      slug: input.slug,
      name: input.name,
      description: input.description ?? '',
      version: '1.0.0',
      entrypoints: input.entrypoints,
      enabled: input.enabled ?? true,
      metadata: input.metadata ?? {},
      paymentsConfig: input.paymentsConfig ?? null,
      walletsConfig: input.walletsConfig ?? null,
      a2aConfig: input.a2aConfig ?? null,
      ap2Config: input.ap2Config ?? null,
      analyticsConfig: input.analyticsConfig ?? null,
      identityConfig: input.identityConfig ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const [inserted] = await this.db.insert(agents).values(row).returning();
      return rowToDefinition(inserted);
    } catch (err: unknown) {
      // Handle unique constraint violation on slug
      if (isUniqueViolation(err)) {
        throw new SlugExistsError(input.slug);
      }
      throw err;
    }
  }

  async update(
    id: string,
    partial: Partial<CreateAgentInput>
  ): Promise<AgentDefinition | null> {
    // Build update object, excluding immutable fields
    const updateData: Partial<typeof agents.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (partial.slug !== undefined) updateData.slug = partial.slug;
    if (partial.name !== undefined) updateData.name = partial.name;
    if (partial.description !== undefined)
      updateData.description = partial.description;
    if (partial.entrypoints !== undefined)
      updateData.entrypoints = partial.entrypoints;
    if (partial.enabled !== undefined) updateData.enabled = partial.enabled;
    if (partial.metadata !== undefined) updateData.metadata = partial.metadata;
    // Extension configs: convert undefined to null for DB storage
    if ('paymentsConfig' in partial)
      updateData.paymentsConfig = partial.paymentsConfig ?? null;
    if ('walletsConfig' in partial)
      updateData.walletsConfig = partial.walletsConfig ?? null;
    if ('a2aConfig' in partial)
      updateData.a2aConfig = partial.a2aConfig ?? null;
    if ('ap2Config' in partial)
      updateData.ap2Config = partial.ap2Config ?? null;
    if ('analyticsConfig' in partial)
      updateData.analyticsConfig = partial.analyticsConfig ?? null;
    if ('identityConfig' in partial)
      updateData.identityConfig = partial.identityConfig ?? null;

    try {
      const [updated] = await this.db
        .update(agents)
        .set(updateData)
        .where(eq(agents.id, id))
        .returning();

      return updated ? rowToDefinition(updated) : null;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new SlugExistsError(partial.slug!);
      }
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(agents)
      .where(eq(agents.id, id))
      .returning({ id: agents.id });

    return result.length > 0;
  }
}

interface PostgresError {
  code: string;
  constraint?: string;
}

/**
 * Check if error is a Postgres unique constraint violation (code 23505).
 * Handles both raw postgres errors and Drizzle-wrapped errors.
 */
function isUniqueViolation(err: unknown): boolean {
  // Direct postgres error
  if (isPostgresError(err) && err.code === '23505') {
    return true;
  }
  // Drizzle wraps errors - check cause
  if (err instanceof Error && 'cause' in err) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (isPostgresError(cause) && cause.code === '23505') {
      return true;
    }
  }
  return false;
}

function isPostgresError(err: unknown): err is PostgresError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PostgresError).code === 'string'
  );
}
