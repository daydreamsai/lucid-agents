import type {
  AgentStore,
  AgentDefinition,
  CreateAgentInput,
  ListOptions,
} from './types';
import { SlugExistsError } from './types';

/**
 * Generate a unique agent ID
 */
function generateId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `ag_${uuid.slice(0, 12)}`;
}

/**
 * Create an in-memory agent store.
 *
 * This is useful for development and testing. Data is lost when the process exits.
 */
export function createMemoryAgentStore(): AgentStore {
  const agents = new Map<string, AgentDefinition>();
  const slugIndex = new Map<string, string>(); // slug -> id

  return {
    async getById(id: string): Promise<AgentDefinition | null> {
      return agents.get(id) ?? null;
    },

    async getBySlug(slug: string): Promise<AgentDefinition | null> {
      const id = slugIndex.get(slug);
      if (!id) return null;
      return agents.get(id) ?? null;
    },

    async list(ownerId: string, opts: ListOptions = {}): Promise<AgentDefinition[]> {
      const { offset = 0, limit = 20 } = opts;

      return Array.from(agents.values())
        .filter((agent) => agent.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(offset, offset + limit);
    },

    async count(ownerId: string): Promise<number> {
      return Array.from(agents.values()).filter(
        (agent) => agent.ownerId === ownerId
      ).length;
    },

    async create(
      input: CreateAgentInput & { ownerId: string }
    ): Promise<AgentDefinition> {
      // Check slug uniqueness
      if (slugIndex.has(input.slug)) {
        throw new SlugExistsError(input.slug);
      }

      const id = generateId();
      const now = new Date();

      const agent: AgentDefinition = {
        id,
        ownerId: input.ownerId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? '',
        version: '1.0.0',
        entrypoints: input.entrypoints,
        enabled: input.enabled ?? true,
        metadata: input.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      };

      agents.set(id, agent);
      slugIndex.set(input.slug, id);

      return agent;
    },

    async update(
      id: string,
      partial: Partial<CreateAgentInput>
    ): Promise<AgentDefinition | null> {
      const existing = agents.get(id);
      if (!existing) return null;

      // Handle slug change
      if (partial.slug && partial.slug !== existing.slug) {
        if (slugIndex.has(partial.slug)) {
          throw new SlugExistsError(partial.slug);
        }
        slugIndex.delete(existing.slug);
        slugIndex.set(partial.slug, id);
      }

      const updated: AgentDefinition = {
        ...existing,
        ...partial,
        // Prevent overwriting immutable fields
        id: existing.id,
        ownerId: existing.ownerId,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      };

      agents.set(id, updated);
      return updated;
    },

    async delete(id: string): Promise<boolean> {
      const existing = agents.get(id);
      if (!existing) return false;

      slugIndex.delete(existing.slug);
      agents.delete(id);
      return true;
    },
  };
}
