import type { QueryClient } from '@tanstack/react-query'
import {
  getApiAgentsQueryKey,
  getApiAgentsByAgentIdQueryKey,
  getAgentsByAgentIdEntrypointsOptions,
  getApiAgentsOptions,
  getApiAgentsByAgentIdOptions,
} from '@lucid-agents/hono-runtime/sdk/react-query'
import { apiClient } from '../client'

/**
 * Invalidate all agent-related queries
 */
export function invalidateAllAgents(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: getApiAgentsQueryKey() })
}

/**
 * Invalidate a specific agent and its related data
 */
export function invalidateAgent(queryClient: QueryClient, agentId: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getApiAgentsByAgentIdQueryKey({
        client: apiClient,
        path: { agentId },
      }),
    }),
    queryClient.invalidateQueries({ queryKey: getApiAgentsQueryKey() }),
  ])
}

/**
 * Remove a specific agent from cache entirely
 */
export function removeAgentFromCache(queryClient: QueryClient, agentId: string) {
  queryClient.removeQueries({
    queryKey: getApiAgentsByAgentIdQueryKey({
      client: apiClient,
      path: { agentId },
    }),
  })
}

/**
 * Prefetch agents list for navigation
 */
export function prefetchAgents(
  queryClient: QueryClient,
  options?: { limit?: number }
) {
  return queryClient.prefetchQuery(
    getApiAgentsOptions({
      client: apiClient,
      query: { limit: options?.limit ?? 20 },
    })
  )
}

/**
 * Prefetch a single agent by ID
 */
export function prefetchAgent(queryClient: QueryClient, agentId: string) {
  return queryClient.prefetchQuery(
    getApiAgentsByAgentIdOptions({
      client: apiClient,
      path: { agentId },
    })
  )
}

/**
 * Prefetch agent with its entrypoints
 */
export function prefetchAgentWithEntrypoints(
  queryClient: QueryClient,
  agentId: string
) {
  return Promise.all([
    queryClient.prefetchQuery(
      getApiAgentsByAgentIdOptions({
        client: apiClient,
        path: { agentId },
      })
    ),
    queryClient.prefetchQuery(
      getAgentsByAgentIdEntrypointsOptions({
        client: apiClient,
        path: { agentId },
      })
    ),
  ])
}

/**
 * Clear all cached data (useful for logout)
 */
export function clearAllCache(queryClient: QueryClient) {
  queryClient.clear()
}

/**
 * Reset all queries to their initial state
 */
export function resetAllQueries(queryClient: QueryClient) {
  return queryClient.resetQueries()
}
