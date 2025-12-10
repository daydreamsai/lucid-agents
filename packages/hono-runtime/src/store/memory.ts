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

    async list(
      ownerId: string,
      opts: ListOptions = {}
    ): Promise<AgentDefinition[]> {
      const { offset = 0, limit = 20, search, enabled } = opts;

      return Array.from(agents.values())
        .filter((agent) => {
          // Owner filter
          if (agent.ownerId !== ownerId) return false;

          // Enabled filter
          if (enabled !== undefined && agent.enabled !== enabled) return false;

          // Search filter (case-insensitive)
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesName = agent.name.toLowerCase().includes(searchLower);
            const matchesSlug = agent.slug.toLowerCase().includes(searchLower);
            const matchesDescription = agent.description
              .toLowerCase()
              .includes(searchLower);
            if (!matchesName && !matchesSlug && !matchesDescription) {
              return false;
            }
          }

          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(offset, offset + limit);
    },

    async count(
      ownerId: string,
      opts: Pick<ListOptions, 'search' | 'enabled'> = {}
    ): Promise<number> {
      const { search, enabled } = opts;

      return Array.from(agents.values()).filter((agent) => {
        // Owner filter
        if (agent.ownerId !== ownerId) return false;

        // Enabled filter
        if (enabled !== undefined && agent.enabled !== enabled) return false;

        // Search filter (case-insensitive)
        if (search) {
          const searchLower = search.toLowerCase();
          const matchesName = agent.name.toLowerCase().includes(searchLower);
          const matchesSlug = agent.slug.toLowerCase().includes(searchLower);
          const matchesDescription = agent.description
            .toLowerCase()
            .includes(searchLower);
          if (!matchesName && !matchesSlug && !matchesDescription) {
            return false;
          }
        }

        return true;
      }).length;
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
        // Extension configs
        paymentsConfig: input.paymentsConfig,
        walletsConfig: input.walletsConfig,
        a2aConfig: input.a2aConfig,
        ap2Config: input.ap2Config,
        analyticsConfig: input.analyticsConfig,
        identityConfig: input.identityConfig,
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
