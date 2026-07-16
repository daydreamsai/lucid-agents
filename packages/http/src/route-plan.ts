import type {
  AgentHttpHandlers,
  AgentHttpRoute,
} from '@lucid-agents/types/http';

export type CreateAgentRoutePlanOptions = {
  basePath: string;
  handlers: AgentHttpHandlers;
  hasTasks: boolean;
};

/**
 * Build the canonical transport-neutral route table for a completed HTTP
 * runtime. Adapters should bind this plan directly instead of duplicating
 * paths, capability checks, or authorization behavior.
 */
export function createAgentRoutePlan({
  basePath,
  handlers,
  hasTasks,
}: CreateAgentRoutePlanOptions): readonly AgentHttpRoute[] {
  const at = (path: string): string => `${basePath}${path}` || '/';
  const routes: AgentHttpRoute[] = [
    {
      id: 'health',
      method: 'GET',
      path: at('/health'),
      params: [],
      handle: request => handlers.health(request),
    },
    {
      id: 'entrypoints',
      method: 'GET',
      path: at('/entrypoints'),
      params: [],
      handle: request => handlers.entrypoints(request),
    },
    {
      id: 'invoke',
      method: 'POST',
      path: at('/entrypoints/:key/invoke'),
      params: ['key'],
      handle: (request, params) =>
        handlers.invoke(request, { key: params.key }),
    },
    {
      id: 'stream',
      method: 'POST',
      path: at('/entrypoints/:key/stream'),
      params: ['key'],
      handle: (request, params) =>
        handlers.stream(request, { key: params.key }),
    },
    {
      id: 'legacyManifest',
      method: 'GET',
      path: at('/.well-known/agent.json'),
      params: [],
      handle: request => handlers.manifest(request),
    },
    {
      id: 'manifest',
      method: 'GET',
      path: at('/.well-known/agent-card.json'),
      params: [],
      handle: request => handlers.manifest(request),
    },
    {
      id: 'oasf',
      method: 'GET',
      path: at('/.well-known/oasf-record.json'),
      params: [],
      handle: request => handlers.oasf(request),
    },
    {
      id: 'favicon',
      method: 'GET',
      path: at('/favicon.svg'),
      params: [],
      handle: request => handlers.favicon(request),
    },
  ];

  if (hasTasks) {
    routes.push(
      {
        id: 'tasks',
        method: 'POST',
        path: at('/tasks'),
        params: [],
        handle: request => handlers.tasks(request),
      },
      {
        id: 'listTasks',
        method: 'GET',
        path: at('/tasks'),
        params: [],
        handle: request => handlers.listTasks(request),
      },
      {
        id: 'getTask',
        method: 'GET',
        path: at('/tasks/:taskId'),
        params: ['taskId'],
        handle: (request, params) =>
          handlers.getTask(request, { taskId: params.taskId }),
      },
      {
        id: 'cancelTask',
        method: 'POST',
        path: at('/tasks/:taskId/cancel'),
        params: ['taskId'],
        handle: (request, params) =>
          handlers.cancelTask(request, { taskId: params.taskId }),
      },
      {
        id: 'subscribeTask',
        method: 'GET',
        path: at('/tasks/:taskId/subscribe'),
        params: ['taskId'],
        handle: (request, params) =>
          handlers.subscribeTask(request, { taskId: params.taskId }),
      }
    );
  }

  if (handlers.landing) {
    routes.push({
      id: 'landing',
      method: 'GET',
      path: at('/'),
      params: [],
      handle: request => handlers.landing!(request),
    });
  }

  return routes;
}
