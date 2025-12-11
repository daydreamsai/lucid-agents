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
import { DrizzleAgentStore } from './store/drizzle/store';
import {
  RuntimeCache,
  buildRuntimeForAgent,
  type RuntimeFactoryConfig,
} from './factory';
import * as routes from './openapi/routes';
import type * as schemaTypes from './openapi/schemas';
import { createAgentIdentity } from '@lucid-agents/identity';
import {
  getSummary,
  getAllTransactions,
  exportToCSV,
  exportToJSON,
} from '@lucid-agents/analytics';

// Auth imports
import { createAuth, type Auth } from './auth';
import {
  createSessionMiddleware,
  getOwnerId,
  type AuthVariables,
} from './auth/middleware';

// =============================================================================
// Configuration Types
// =============================================================================

export interface AuthOptions {
  /** Disable authentication entirely (dev mode) */
  disabled?: boolean;
  /** Base URL for auth server */
  baseURL?: string;
  /** Secret for signing tokens */
  secret?: string;
  /** Enable email verification */
  emailVerification?: boolean;
}

export interface CorsOptions {
  /** Allowed origins (defaults to '*' if credentials false, must be specific if credentials true) */
  origin?: string | string[];
  /** Allow credentials (cookies, authorization headers) */
  credentials?: boolean;
}

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

  /** Authentication configuration */
  auth?: AuthOptions;

  /** CORS configuration */
  cors?: CorsOptions;
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
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();
  const runtimeCache = new RuntimeCache(config.maxCachedRuntimes ?? 100);
  const defaultOwnerId = config.defaultOwnerId ?? 'default-owner';
  const authDisabled = config.auth?.disabled ?? false;

  // If using Drizzle store, pass the database instance to factory for shared payment storage
  const factoryConfig: RuntimeFactoryConfig = {
    ...config.factoryConfig,
    drizzleDb:
      config.store instanceof DrizzleAgentStore
        ? config.store.database
        : config.factoryConfig?.drizzleDb,
  };

  // Configure CORS - must allow credentials for auth cookies
  const corsOrigin =
    config.cors?.origin ??
    (config.cors?.credentials ? 'http://localhost:3000' : '*');
  // Build trusted origins list for better-auth
  const trustedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];

  // Create auth instance if using Drizzle store and auth is enabled
  let auth: Auth | null = null;
  if (!authDisabled && config.store instanceof DrizzleAgentStore) {
    auth = createAuth({
      db: config.store.database,
      baseURL: config.auth?.baseURL,
      secret: config.auth?.secret,
      emailVerification: config.auth?.emailVerification,
      trustedOrigins,
    });
  }

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------
  app.use(
    '*',
    cors({
      origin: corsOrigin,
      credentials: config.cors?.credentials ?? !authDisabled, // Enable credentials when auth is enabled
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['Set-Cookie'],
    })
  );
  app.use('*', logger());

  // Add session middleware if auth is enabled
  if (auth) {
    app.use('*', createSessionMiddleware(auth));
  }

  // ---------------------------------------------------------------------------
  // Auth Routes (mounted before other routes)
  // ---------------------------------------------------------------------------

  if (auth) {
    // Mount better-auth handler for all /api/auth/* routes
    app.on(['POST', 'GET'], '/api/auth/*', c => auth!.handler(c.req.raw));
  }

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

  // Helper to get owner ID from auth context or fallback
  const resolveOwnerId = (c: any): string => {
    if (authDisabled) {
      return defaultOwnerId;
    }
    return getOwnerId(c, defaultOwnerId);
  };

  // List agents
  app.openapi(routes.listAgentsRoute, (async (c: any) => {
    const { offset, limit, search, enabled } = c.req.valid('query');
    const ownerId = resolveOwnerId(c);

    const agents = await config.store.list(ownerId, {
      offset,
      limit,
      search,
      enabled,
    });
    const total = await config.store.count(ownerId, { search, enabled });

    // Convert dates to ISO strings for JSON response
    const serializedAgents = agents.map(serializeAgent);

    return c.json({ agents: serializedAgents, total, offset, limit }, 200);
  }) as any);

  // Create agent
  app.openapi(routes.createAgentRoute, (async (c: any) => {
    const body = c.req.valid('json');
    const ownerId = resolveOwnerId(c);

    try {
      let agent = await config.store.create({ ...body, ownerId });

      // Handle identity registration if configured and auto-register is enabled
      if (agent.identityConfig?.autoRegister && agent.walletsConfig?.agent) {
        try {
          const domain = new URL(c.req.url).hostname;
          const runtime = await buildRuntimeForAgent(agent, factoryConfig);

          if (runtime.wallets?.agent) {
            const identity = await createAgentIdentity({
              runtime,
              domain,
              chainId: agent.identityConfig.chainId,
              registryAddress: agent.identityConfig.registryAddress as
                | `0x${string}`
                | undefined,
              autoRegister: true,
              trustModels: agent.identityConfig.trustModels,
              trustOverrides: agent.identityConfig.trustOverrides,
            });

            // Update agent metadata with identity status
            const updatedMetadata = {
              ...agent.metadata,
              identityStatus:
                identity.record && identity.record.agentId
                  ? 'registered'
                  : 'failed',
              identityRecord: identity.record
                ? {
                    agentId: identity.record.agentId?.toString(),
                    owner: identity.record.owner,
                    tokenURI: identity.record.tokenURI,
                  }
                : undefined,
              identityError: undefined,
            };

            await config.store.update(agent.id, { metadata: updatedMetadata });
            // Reload agent to get updated metadata
            const updatedAgent = await config.store.getById(agent.id);
            if (updatedAgent) {
              return c.json(serializeAgent(updatedAgent), 201);
            }
          }
        } catch (identityErr) {
          // Log error but don't fail agent creation
          console.error('Identity registration failed:', identityErr);
          // Update metadata with failure status
          const updatedMetadata = {
            ...agent.metadata,
            identityStatus: 'failed',
            identityError:
              identityErr instanceof Error
                ? identityErr.message
                : String(identityErr),
          };
          await config.store.update(agent.id, { metadata: updatedMetadata });
          // Reload agent to get updated metadata
          const reloadedAgent = await config.store.getById(agent.id);
          if (reloadedAgent) {
            agent = reloadedAgent;
          }
        }
      }

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
      runtime = await buildRuntimeForAgent(agent, factoryConfig);
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

    const requestBody: {
      input: unknown;
      sessionId?: string;
      metadata?: Record<string, unknown>;
    } = {
      input: body.input,
    };
    if (body.sessionId !== undefined) {
      requestBody.sessionId = body.sessionId;
    }
    if (body.metadata !== undefined) {
      requestBody.metadata = body.metadata;
    }

    const invokeRequest = new Request(c.req.url, {
      method: 'POST',
      headers: c.req.raw.headers,
      body: JSON.stringify(requestBody),
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
  // Analytics Routes
  // ---------------------------------------------------------------------------

  // Get analytics summary
  app.openapi(routes.getAnalyticsSummaryRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');
    const { windowHours } = c.req.valid('query');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    if (!runtime.analytics?.paymentTracker) {
      return c.json(
        {
          error: 'Analytics not available',
          code: 'ANALYTICS_NOT_AVAILABLE',
          details: { reason: 'Payments not enabled' },
        },
        400
      );
    }

    const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : undefined;
    const summary = await getSummary(
      runtime.analytics.paymentTracker,
      windowMs
    );

    // Convert bigint to string for JSON
    return c.json(
      {
        outgoingTotal: summary.outgoingTotal.toString(),
        incomingTotal: summary.incomingTotal.toString(),
        netTotal: summary.netTotal.toString(),
        outgoingCount: summary.outgoingCount,
        incomingCount: summary.incomingCount,
        windowStart: summary.windowStart ?? null,
        windowEnd: summary.windowEnd,
      },
      200
    );
  }) as any);

  // Get analytics transactions
  app.openapi(routes.getAnalyticsTransactionsRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');
    const { windowHours, direction } = c.req.valid('query');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    if (!runtime.analytics?.paymentTracker) {
      return c.json(
        {
          error: 'Analytics not available',
          code: 'ANALYTICS_NOT_AVAILABLE',
          details: { reason: 'Payments not enabled' },
        },
        400
      );
    }

    const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : undefined;
    let transactions = await getAllTransactions(
      runtime.analytics.paymentTracker,
      windowMs
    );

    // Filter by direction if specified
    if (direction) {
      transactions = transactions.filter(t => t.direction === direction);
    }

    // Convert bigint to string for JSON
    return c.json(
      transactions.map(t => ({
        ...t,
        amount: t.amount.toString(),
      })),
      200
    );
  }) as any);

  // Export analytics CSV
  app.openapi(routes.exportAnalyticsCSVRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');
    const { windowHours } = c.req.valid('query');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    if (!runtime.analytics?.paymentTracker) {
      return c.json(
        {
          error: 'Analytics not available',
          code: 'ANALYTICS_NOT_AVAILABLE',
          details: { reason: 'Payments not enabled' },
        },
        400
      );
    }

    const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : undefined;
    const csv = await exportToCSV(runtime.analytics.paymentTracker, windowMs);

    return c.text(csv, 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="analytics.csv"',
    });
  }) as any);

  // Export analytics JSON
  app.openapi(routes.exportAnalyticsJSONRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');
    const { windowHours } = c.req.valid('query');

    const result = await getOrBuildRuntime(agentId);
    if (!result) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    const { runtime } = result;

    if (!runtime.analytics?.paymentTracker) {
      return c.json(
        {
          error: 'Analytics not available',
          code: 'ANALYTICS_NOT_AVAILABLE',
          details: { reason: 'Payments not enabled' },
        },
        400
      );
    }

    const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : undefined;
    const json = await exportToJSON(runtime.analytics.paymentTracker, windowMs);

    return c.text(json, 200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="analytics.json"',
    });
  }) as any);

  // ---------------------------------------------------------------------------
  // Identity Routes
  // ---------------------------------------------------------------------------

  // Retry identity registration
  app.openapi(routes.retryIdentityRoute, (async (c: any) => {
    const { agentId } = c.req.valid('param');

    const agent = await config.store.getById(agentId);
    if (!agent) {
      return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404);
    }

    if (!agent.identityConfig || !agent.walletsConfig?.agent) {
      return c.json(
        {
          error: 'Identity not configured',
          code: 'IDENTITY_NOT_CONFIGURED',
          details: {
            reason:
              'Identity config or wallet config is missing. Both are required for identity registration.',
          },
        },
        400
      );
    }

    try {
      const domain = new URL(c.req.url).hostname;
      const runtime = await buildRuntimeForAgent(agent, factoryConfig);

      if (!runtime.wallets?.agent) {
        return c.json(
          {
            error: 'Wallet not available',
            code: 'WALLET_NOT_AVAILABLE',
            details: { reason: 'Agent wallet is not configured' },
          },
          400
        );
      }

      const identity = await createAgentIdentity({
        runtime,
        domain,
        chainId: agent.identityConfig.chainId,
        registryAddress: agent.identityConfig.registryAddress as
          | `0x${string}`
          | undefined,
        autoRegister: true,
        trustModels: agent.identityConfig.trustModels,
        trustOverrides: agent.identityConfig.trustOverrides,
      });

      // Update agent metadata with identity status
      const updatedMetadata = {
        ...agent.metadata,
        identityStatus:
          identity.record && identity.record.agentId ? 'registered' : 'failed',
        identityRecord: identity.record
          ? {
              agentId: identity.record.agentId?.toString(),
              owner: identity.record.owner,
              tokenURI: identity.record.tokenURI,
            }
          : undefined,
        identityError: undefined,
      };

      await config.store.update(agentId, { metadata: updatedMetadata });

      return c.json(
        {
          status:
            identity.record && identity.record.agentId
              ? 'registered'
              : 'failed',
          agentId: identity.record?.agentId?.toString(),
          owner: identity.record?.owner,
          tokenURI: identity.record?.tokenURI,
          domain,
          error: undefined,
        },
        200
      );
    } catch (err) {
      return c.json(
        {
          error: 'Identity registration failed',
          code: 'IDENTITY_REGISTRATION_FAILED',
          details: {
            reason: err instanceof Error ? err.message : String(err),
          },
        },
        500
      );
    }
  }) as any);

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
