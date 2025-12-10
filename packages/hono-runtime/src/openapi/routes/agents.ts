import { createRoute } from '@hono/zod-openapi';
import {
  AgentIdParamSchema,
  AgentDefinitionSchema,
  AgentListResponseSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  ErrorSchema,
  AgentSearchQuerySchema,
} from '../schemas';

// =============================================================================
// List Agents
// =============================================================================

export const listAgentsRoute = createRoute({
  method: 'get',
  path: '/api/agents',
  tags: ['Agents'],
  summary: 'List agents',
  description:
    'List all agents for the current owner with pagination, search, and filtering.',
  request: {
    query: AgentSearchQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentListResponseSchema,
        },
      },
      description: 'List of agents',
    },
  },
});

// =============================================================================
// Create Agent
// =============================================================================

export const createAgentRoute = createRoute({
  method: 'post',
  path: '/api/agents',
  tags: ['Agents'],
  summary: 'Create agent',
  description: 'Create a new agent with the given configuration.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAgentSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: AgentDefinitionSchema,
        },
      },
      description: 'Agent created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Validation error',
    },
    409: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Slug already exists',
    },
  },
});

// =============================================================================
// Get Agent
// =============================================================================

export const getAgentRoute = createRoute({
  method: 'get',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Get agent',
  description: 'Get an agent by its ID.',
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentDefinitionSchema,
        },
      },
      description: 'Agent definition',
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
// Update Agent
// =============================================================================

export const updateAgentRoute = createRoute({
  method: 'put',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Update agent',
  description: 'Update an existing agent. Only provided fields will be updated.',
  request: {
    params: AgentIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateAgentSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: AgentDefinitionSchema,
        },
      },
      description: 'Agent updated successfully',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Agent not found',
    },
    409: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Slug already exists',
    },
  },
});

// =============================================================================
// Delete Agent
// =============================================================================

export const deleteAgentRoute = createRoute({
  method: 'delete',
  path: '/api/agents/{agentId}',
  tags: ['Agents'],
  summary: 'Delete agent',
  description: 'Delete an agent by its ID.',
  request: {
    params: AgentIdParamSchema,
  },
  responses: {
    204: {
      description: 'Agent deleted successfully',
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
