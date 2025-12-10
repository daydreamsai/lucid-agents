import type { AgentDefinition } from '../types';
import type { AgentRow } from './schema';

/**
 * Generate a unique agent ID with ag_ prefix
 */
export function generateId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `ag_${uuid.slice(0, 12)}`;
}

/**
 * Convert database row to AgentDefinition
 */
export function rowToDefinition(row: AgentRow): AgentDefinition {
  return {
    id: row.id,
    ownerId: row.ownerId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    entrypoints: row.entrypoints,
    enabled: row.enabled,
    metadata: row.metadata,
    paymentsConfig: row.paymentsConfig ?? undefined,
    walletsConfig: row.walletsConfig ?? undefined,
    a2aConfig: row.a2aConfig ?? undefined,
    ap2Config: row.ap2Config ?? undefined,
    analyticsConfig: row.analyticsConfig ?? undefined,
    identityConfig: row.identityConfig ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
