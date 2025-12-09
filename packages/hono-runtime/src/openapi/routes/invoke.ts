import { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import {
  AgentIdParamSchema,
  EntrypointKeyParamSchema,
  SerializedEntrypointSchema,
  InvokeRequestSchema,
  InvokeResponseSchema,
  AgentManifestSchema,
  ErrorSchema,
} from '../schemas';

// =============================================================================
// Get Agent Manifest
// =============================================================================

export const getAgentManifestRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/.well-known/agent.json',
  tags: ['Invocation'],
  summary: 'Get agent manifest',
  description: 'Get the agent manifest/card in A2A-compatible format.',
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentManifestSchema,
        },
      },
      description: 'Agent manifest',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Agent not found',
    },
  },
});

// =============================================================================
// List Entrypoints
// =============================================================================

export const listEntrypointsRoute = createRoute({
  method: 'get',
  path: '/agents/{agentId}/entrypoints',
  tags: ['Invocation'],
  summary: 'List entrypoints',
  description: 'List all entrypoints for an agent.',
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(SerializedEntrypointSchema),
        },
      },
      description: 'List of entrypoints',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Agent not found',
    },
  },
});

// =============================================================================
// Invoke Entrypoint
// =============================================================================

export const invokeEntrypointRoute = createRoute({
  method: 'post',
  path: '/agents/{agentId}/entrypoints/{key}/invoke',
  tags: ['Invocation'],
  summary: 'Invoke entrypoint',
  description: 'Execute an agent entrypoint synchronously and return the result.',
  request: {
    params: AgentIdParamSchema.merge(EntrypointKeyParamSchema),
    body: {
      content: {
        'application/json': {
          schema: InvokeRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: InvokeResponseSchema,
        },
      },
      description: 'Invocation successful',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid input',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Agent or entrypoint not found',
    },
  },
});
