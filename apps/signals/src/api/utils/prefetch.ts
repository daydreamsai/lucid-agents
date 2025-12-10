import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  prefetchAgents,
  prefetchAgent,
  prefetchAgentWithEntrypoints,
} from './cache'

/**
 * Hook for prefetching agents list on hover/focus
 *
 * @example
 * ```tsx
 * const prefetch = usePrefetchAgents()
 * <Link onMouseEnter={prefetch} to="/agents">Agents</Link>
 * ```
 */
export function usePrefetchAgents(options?: { limit?: number }) {
  const queryClient = useQueryClient()

  return useCallback(() => {
    prefetchAgents(queryClient, options)
  }, [queryClient, options])
}

/**
 * Hook for prefetching a single agent on hover/focus
 *
 * @example
 * ```tsx
 * const prefetch = usePrefetchAgent(agent.id)
 * <Link onMouseEnter={prefetch} to={`/agents/${agent.id}`}>View</Link>
 * ```
 */
export function usePrefetchAgent(agentId: string) {
  const queryClient = useQueryClient()

  return useCallback(() => {
    if (agentId) {
      prefetchAgent(queryClient, agentId)
    }
  }, [queryClient, agentId])
}

/**
 * Hook for prefetching agent with entrypoints (for detail pages)
 *
 * @example
 * ```tsx
 * const prefetch = usePrefetchAgentDetails(agent.id)
 * <Link onMouseEnter={prefetch} to={`/agents/${agent.id}`}>Details</Link>
 * ```
 */
export function usePrefetchAgentDetails(agentId: string) {
  const queryClient = useQueryClient()

  return useCallback(() => {
    if (agentId) {
      prefetchAgentWithEntrypoints(queryClient, agentId)
    }
  }, [queryClient, agentId])
}
