import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { AgentStore } from '../types';
import { DrizzleAgentStore } from './store';
import * as schema from './schema';

export interface DrizzleStoreOptions {
  /** Postgres connection string */
  connectionString: string;
  /** Connection pool size (default: 10) */
  maxConnections?: number;
}

/**
 * Create a Drizzle-backed agent store using PostgreSQL.
 *
 * @example
 * ```ts
 * const store = createDrizzleAgentStore({
 *   connectionString: process.env.DATABASE_URL!,
 *   maxConnections: 20,
 * });
 *
 * const app = createHonoRuntime({ store });
 * ```
 */
export function createDrizzleAgentStore(options: DrizzleStoreOptions): AgentStore {
  const client = postgres(options.connectionString, {
    max: options.maxConnections ?? 10,
  });

  const db = drizzle(client, { schema });

  return new DrizzleAgentStore(db);
}

// Re-export for advanced usage
export { DrizzleAgentStore } from './store';
export { agents as agentsTable, type AgentRow, type NewAgentRow } from './schema';
