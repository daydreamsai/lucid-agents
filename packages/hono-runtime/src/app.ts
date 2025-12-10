/**
 * Hono Runtime with OpenAPI validation
 *
 * Full OpenAPI support with Zod schema validation and auto-generated docs.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import type { AgentStore, AgentDefinition } from './store/types';
import { SlugExistsError } from './store/types';
import {
  RuntimeCache,
  buildRuntimeForAgent,
  type RuntimeFactoryConfig,
} from './factory';
import * as routes from './openapi/routes';
import type * as schemaTypes from './openapi/schemas';

// =============================================================================
// Configuration Types
// =============================================================================

export interface HonoRuntimeConfig {
  /** Agent store for persistence */
  store: AgentStore;

  /** Runtime factory configuration */
  factoryConfig?: RuntimeFactoryConfig;

  /** Maximum number of cached runtimes */
  maxCachedRuntimes?: number;

  /** OpenAPI documentation metadata */
  openapi?: {
    title?: string;
    version?: string;
    description?: string;
  };

  /** Default owner ID for unauthenticated requests (dev mode) */
  defaultOwnerId?: string;
}

// =============================================================================
// Main App Factory
// =============================================================================

/**
 * Create a Hono runtime app for serving agents.
 *
 * @example
 * ```ts
 * import { createHonoRuntime, createMemoryAgentStore } from '@lucid-agents/hono-runtime';
 *
 * const store = createMemoryAgentStore();
 * const app = createHonoRuntime({ store });
 *
 * Bun.serve({ port: 8787, fetch: app.fetch });
 * ```
 */
export function createHonoRuntime(config: HonoRuntimeConfig) {
  const app = new OpenAPIHono();
  const runtimeCache = new RuntimeCache(config.maxCachedRuntimes ?? 100);
  const defaultOwnerId = config.defaultOwnerId ?? 'default-owner';

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  app.use('*', cors());
  app.use('*', logger());

  // ---------------------------------------------------------------------------
  // OpenAPI Documentation
  // ---------------------------------------------------------------------------

  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      title: config.openapi?.title ?? 'Lucid Agents Runtime',
      version: config.openapi?.version ?? '0.1.0',
      description:
        config.openapi?.description ?? 'Stateless multi-agent runtime API',
    },
    tags: [
      { name: 'Platform', description: 'Health and system info' },
      { name: 'Agents', description: 'Agent CRUD operations' },
      { name: 'Invocation', description: 'Invoke agent entrypoints' },
    ],
  });

  // ---------------------------------------------------------------------------
  // Agent CRUD Routes
  // ---------------------------------------------------------------------------

  // List agents
  app.openapi(routes.listAgentsRoute, (async (c: any) => {
    const { offset, limit } = c.req.valid('query');
    const ownerId = defaultOwnerId; // TODO: get from auth

    const agents = await config.store.list(ownerId, { offset, limit });
    const total = await config.store.count(ownerId);

    // Convert dates to ISO strings for JSON response
    const serializedAgents = agents.map(serializeAgent);

    return c.json({ agents: serializedAgents, total, offset, limit }, 200);
  }) as any);

  // Create agent
  app.openapi(routes.createAgentRoute, (async (c: any) => {
    const body = c.req.valid('json');
    const ownerId = defaultOwnerId; // TODO: get from auth

    try {
      const agent = await config.store.create({ ...body, ownerId });
      return c.json(serializeAgent(agent), 201);
    } catch (err) {
      if (err instanceof SlugExistsError) {
        return c.json(
          { error: 'Slug already exists', code: 'SLUG_EXISTS' },
          409
        );
      }
      throw err;
    }
  }) as any);

  // Get agent
  app.openapi(routes.getAgentRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');

    const agent = await config.store.getById(agentId);
    if (!agent) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json(serializeAgent(agent), 200);
  }) as any);

  // Update agent
  app.openapi(routes.updateAgentRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const agent = await config.store.update(agentId, body);
      if (!agent) {
        return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
      }
      // Invalidate cached runtime when agent is updated
      runtimeCache.delete(agentId);
      return c.json(serializeAgent(agent), 200);
    } catch (err) {
      if (err instanceof SlugExistsError) {
        return c.json(
          { error: 'Slug already exists', code: 'SLUG_EXISTS' },
          409
        );
      }
      throw err;
    }
  }) as any);

  // Delete agent
  app.openapi(routes.deleteAgentRoute, async c => {
    const { agentId } = c.req.valid('param');

    const deleted = await config.store.delete(agentId);
    if (!deleted) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    // Remove from cache
    runtimeCache.delete(agentId);

    return c.body(null, 204);
  });

  // ---------------------------------------------------------------------------
  // Helper: Get or Build Runtime
  // ---------------------------------------------------------------------------

  async function getOrBuildRuntime(agentId: string) {
    const agent = await config.store.getById(agentId);
    if (!agent || !agent.enabled) {
      return null;
    }

    // Check cache
    let runtime = runtimeCache.get(agentId, agent.version);
    if (!runtime) {
      // Build new runtime using factory
      runtime = await buildRuntimeForAgent(agent, config.factoryConfig);
      runtimeCache.set(agentId, agent.version, runtime);
    }

    return { agent, runtime };
  }

  // ---------------------------------------------------------------------------
  // Agent Invocation Routes
  // ---------------------------------------------------------------------------

  // Get agent manifest (A2A compatible)
  // Return the full agent manifest (AgentCardWithEntrypoints)
  app.openapi(routes.getAgentManifestRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    // Use the runtime's manifest builder for proper A2A card
    const origin = new URL(c.req.url).origin;
    const manifest = runtime.manifest.build(origin);

    return c.json(manifest, 200);
  }) as any);

  // List entrypoints
  // Note: Type assertion needed due to runtime entrypoint list format
  app.openapi(routes.listEntrypointsRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { agent } = result;
    const entrypoints = agent.entrypoints;

    return c.json(entrypoints, 200);
  }) as any);

  // Invoke entrypoint - uses runtime handler but wraps response in our format
  // Note: Type assertion needed due to complex response type union
  app.openapi(routes.invokeEntrypointRoute, (async (c: any) => {
    const { agentId, key } = c.req.valid('param');
    const body = c.req.valid('json');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    // Check if entrypoint exists
    const entrypoints = runtime.entrypoints.snapshot();
    const entrypoint = entrypoints.find(ep => ep.key === key);
    if (!entrypoint) {
      return c.json(
        { error: 'Entrypoint not found', code: 'ENTRYPOINT_NOT_FOUND' },
        404
      );
    }

    // Ensure handlers exist
    if (!runtime.handlers) {
      return c.json(
        { error: 'Runtime handlers not available', code: 'INTERNAL_ERROR' },
        500
      );
    }

    // Build request to pass to runtime handler
    const invokeRequest = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify({ input: body.input }),
    });

    // Delegate to the runtime's invoke handler
    const response = await runtime.handlers.invoke(invokeRequest, { key });

    // Parse the runtime's response and wrap it in our format
    const runtimeResult = (await response.json()) as {
      run_id?: string;
      status?: string;
      output?: unknown;
      usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      error?: unknown;
    };

    // If there was an error, pass it through
    if (runtimeResult.error) {
      const status = response.status === 400 ? 400 : 500;
      const errorMessage =
        typeof runtimeResult.error === 'string'
          ? runtimeResult.error
          : 'Entrypoint invocation failed';
      const details =
        runtimeResult.error && typeof runtimeResult.error === 'object'
          ? { error: runtimeResult.error as Record<string, unknown> }
          : undefined;

      return c.json(
        {
          error: errorMessage,
          code: status === 400 ? 'INVALID_INPUT' : 'INTERNAL_ERROR',
          ...(details ? { details } : {}),
        },
        status
      );
    }

    // Generate IDs
    const sessionId = body.sessionId ?? crypto.randomUUID();
    const requestId = runtimeResult.run_id ?? crypto.randomUUID();

    // Return our standardized format
    return c.json(
      {
        output: runtimeResult.output,
        usage: runtimeResult.usage,
        sessionId,
        requestId,
      },
      200
    );
  }) as any);

  app.get('/swagger', swaggerUI({ url: '/doc' }));

  // ---------------------------------------------------------------------------
  // Health Route
  // ---------------------------------------------------------------------------

  app.openapi(routes.healthRoute, ((c: any) => {
    return c.json(
      {
        status: 'ok' as const,
        version: config.openapi?.version ?? '0.1.0',
        timestamp: new Date().toISOString(),
      },
      200
    );
  }) as any);

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Serialize agent definition for JSON response (convert dates to ISO strings)
 */
function serializeAgent(agent: AgentDefinition): schemaTypes.AgentDefinition {
  return {
    ...agent,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  } as schemaTypes.AgentDefinition;
}
