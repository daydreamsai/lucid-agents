/**
 * Simple Hono Runtime (without OpenAPI validation)
 *
 * This version bypasses @hono/zod-openapi to avoid Zod 4 compatibility issues.
 * Use this until zod-openapi supports Zod 4.
 */

import { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import type { AgentStore } from './store/types';
import { SlugExistsError } from './store/types';
import { RuntimeCache, buildRuntimeForAgent, type RuntimeFactoryConfig } from './factory';

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

export function createHonoRuntime(config: HonoRuntimeConfig) {
  const app = new Hono();
  const runtimeCache = new RuntimeCache(config.maxCachedRuntimes ?? 100);
  const defaultOwnerId = config.defaultOwnerId ?? 'default-owner';

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  app.use('*', cors());
  app.use('*', logger());

  // ---------------------------------------------------------------------------
  // Health Route
  // ---------------------------------------------------------------------------

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      version: config.openapi?.version ?? '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/swagger', swaggerUI({ url: '/doc' }));

  // ---------------------------------------------------------------------------
  // Agent CRUD Routes
  // ---------------------------------------------------------------------------

  // List agents
  app.get('/api/agents', async (c) => {
    const offset = Number(c.req.query('offset') ?? 0);
    const limit = Number(c.req.query('limit') ?? 20);
    const ownerId = defaultOwnerId;

    const agents = await config.store.list(ownerId, { offset, limit });
    const total = await config.store.count(ownerId);

    const serializedAgents = agents.map(serializeAgent);
    return c.json({ agents: serializedAgents, total, offset, limit });
  });

  // Create agent
  app.post('/api/agents', async (c) => {
    const body = await c.req.json();
    const ownerId = defaultOwnerId;

    // Basic validation
    if (!body.slug || !body.name || !body.entrypoints?.length) {
      return c.json({ error: 'Missing required fields: slug, name, entrypoints', code: 'VALIDATION_ERROR' }, 400);
    }

    try {
      const agent = await config.store.create({ ...body, ownerId });
      return c.json(serializeAgent(agent), 201);
    } catch (err) {
      if (err instanceof SlugExistsError) {
        return c.json({ error: 'Slug already exists', code: 'SLUG_EXISTS' }, 409);
      }
      throw err;
    }
  });

  // Get agent
  app.get('/api/agents/:agentId', async (c) => {
    const agentId = c.req.param('agentId');

    const agent = await config.store.getById(agentId);
    if (!agent) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json(serializeAgent(agent));
  });

  // Update agent
  app.put('/api/agents/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const body = await c.req.json();

    try {
      const agent = await config.store.update(agentId, body);
      if (!agent) {
        return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
      }
      runtimeCache.delete(agentId);
      return c.json(serializeAgent(agent));
    } catch (err) {
      if (err instanceof SlugExistsError) {
        return c.json({ error: 'Slug already exists', code: 'SLUG_EXISTS' }, 409);
      }
      throw err;
    }
  });

  // Delete agent
  app.delete('/api/agents/:agentId', async (c) => {
    const agentId = c.req.param('agentId');

    const deleted = await config.store.delete(agentId);
    if (!deleted) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

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

    let runtime = runtimeCache.get(agentId, agent.version);
    if (!runtime) {
      runtime = await buildRuntimeForAgent(agent, config.factoryConfig);
      runtimeCache.set(agentId, agent.version, runtime);
    }

    return { agent, runtime };
  }

  // ---------------------------------------------------------------------------
  // Agent Invocation Routes
  // ---------------------------------------------------------------------------

  // Get agent manifest (A2A)
  app.get('/agents/:agentId/.well-known/agent.json', async (c) => {
    const agentId = c.req.param('agentId');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;
    const origin = new URL(c.req.url).origin;
    const manifest = runtime.manifest.build(origin);

    return c.json(manifest);
  });

  // List entrypoints
  app.get('/agents/:agentId/entrypoints', async (c) => {
    const agentId = c.req.param('agentId');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;
    const entrypoints = runtime.entrypoints.list();

    return c.json(entrypoints);
  });

  // Invoke entrypoint
  app.post('/agents/:agentId/entrypoints/:key/invoke', async (c) => {
    const agentId = c.req.param('agentId');
    const key = c.req.param('key');
    const body = await c.req.json();

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    // Check if entrypoint exists
    const entrypoints = runtime.entrypoints.snapshot();
    const entrypoint = entrypoints.find((ep) => ep.key === key);
    if (!entrypoint) {
      return c.json({ error: 'Entrypoint not found', code: 'ENTRYPOINT_NOT_FOUND' }, 404);
    }

    // Ensure handlers exist
    if (!runtime.handlers) {
      return c.json({ error: 'Runtime handlers not available', code: 'INTERNAL_ERROR' }, 500);
    }

    // Build request for runtime handler
    const invokeRequest = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify({ input: body.input }),
    });

    // Delegate to runtime
    const response = await runtime.handlers.invoke(invokeRequest, { key });

    const runtimeResult = await response.json() as {
      run_id?: string;
      output?: unknown;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      error?: unknown;
    };

    if (runtimeResult.error) {
      return c.json(runtimeResult, response.status as 400 | 500);
    }

    const sessionId = body.sessionId ?? crypto.randomUUID();
    const requestId = runtimeResult.run_id ?? crypto.randomUUID();

    return c.json({
      output: runtimeResult.output,
      usage: runtimeResult.usage,
      sessionId,
      requestId,
    });
  });

  return app;
}

// =============================================================================
// Helpers
// =============================================================================

function serializeAgent(agent: {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  entrypoints: unknown[];
  enabled: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...agent,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}
