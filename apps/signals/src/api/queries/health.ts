import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getHealthOptions, getHealthQueryKey } from '@lucid-agents/hono-runtime/sdk/react-query'
import { apiClient } from '../client'

// Re-export query key for invalidation
export { getHealthQueryKey }

export interface UseHealthOptions {
  enabled?: boolean
  refetchInterval?: number | false
}

/**
 * Check API health status
 */
export function useHealth(options: UseHealthOptions = {}) {
  const { enabled = true, refetchInterval = false } = options

  return useQuery({
    ...getHealthOptions({ client: apiClient }),
    enabled,
    refetchInterval,
  })
}

/**
 * Check API health status (suspense mode)
 */
export function useHealthSuspense() {
  return useSuspenseQuery({
    ...getHealthOptions({ client: apiClient }),
  })
}
