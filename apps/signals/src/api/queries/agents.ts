import { useQuery, useSuspenseQuery, useInfiniteQuery } from '@tanstack/react-query'
import {
  getApiAgentsOptions,
  getApiAgentsInfiniteOptions,
  getApiAgentsByAgentIdOptions,
  getAgentsByAgentIdEntrypointsOptions,
  getAgentsByAgentIdWellKnownAgentJsonOptions,
  getApiAgentsQueryKey,
  getApiAgentsByAgentIdQueryKey,
} from '@lucid-agents/hono-runtime/sdk/react-query'
import { apiClient } from '../client'

// Re-export query keys for invalidation
export { getApiAgentsQueryKey, getApiAgentsByAgentIdQueryKey }

export interface UseAgentsOptions {
  offset?: number
  limit?: number
  enabled?: boolean
}

/**
 * Fetch paginated list of agents
 */
export function useAgents(options: UseAgentsOptions = {}) {
  const { offset, limit, enabled = true } = options

  return useQuery({
    ...getApiAgentsOptions({
      client: apiClient,
      query: { offset, limit },
    }),
    enabled,
  })
}

/**
 * Fetch paginated list of agents (suspense mode)
 */
export function useAgentsSuspense(options: Omit<UseAgentsOptions, 'enabled'> = {}) {
  const { offset, limit } = options

  return useSuspenseQuery({
    ...getApiAgentsOptions({
      client: apiClient,
      query: { offset, limit },
    }),
  })
}

/**
 * Infinite scroll for agents list
 */
export function useAgentsInfinite(options: { limit?: number; enabled?: boolean } = {}) {
  const { limit = 20, enabled = true } = options

  return useInfiniteQuery({
    ...getApiAgentsInfiniteOptions({
      client: apiClient,
      query: { limit },
    }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.limit
      return nextOffset < lastPage.total ? nextOffset : undefined
    },
    enabled,
  })
}

export interface UseAgentOptions {
  enabled?: boolean
}

/**
 * Fetch a single agent by ID
 */
export function useAgent(agentId: string, options: UseAgentOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    ...getApiAgentsByAgentIdOptions({
      client: apiClient,
      path: { agentId },
    }),
    enabled: enabled && !!agentId,
  })
}

/**
 * Fetch a single agent by ID (suspense mode)
 */
export function useAgentSuspense(agentId: string) {
  return useSuspenseQuery({
    ...getApiAgentsByAgentIdOptions({
      client: apiClient,
      path: { agentId },
    }),
  })
}

/**
 * Fetch entrypoints for an agent
 */
export function useAgentEntrypoints(agentId: string, options: UseAgentOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    ...getAgentsByAgentIdEntrypointsOptions({
      client: apiClient,
      path: { agentId },
    }),
    enabled: enabled && !!agentId,
  })
}

/**
 * Fetch agent manifest (A2A-compatible format)
 */
export function useAgentManifest(agentId: string, options: UseAgentOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    ...getAgentsByAgentIdWellKnownAgentJsonOptions({
      client: apiClient,
      path: { agentId },
    }),
    enabled: enabled && !!agentId,
  })
}
