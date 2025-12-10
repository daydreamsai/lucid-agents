import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  postApiAgentsMutation,
  putApiAgentsByAgentIdMutation,
  deleteApiAgentsByAgentIdMutation,
} from '@lucid-agents/hono-runtime/sdk/react-query'
import { getApiAgentsQueryKey, getApiAgentsByAgentIdQueryKey } from '../queries/agents'
import { apiClient } from '../client'
import type {
  _Error,
  AgentDefinition,
  AgentListResponse,
} from '@lucid-agents/hono-runtime/sdk'

export interface UseCreateAgentOptions {
  onSuccess?: (agent: AgentDefinition) => void
  onError?: (error: _Error) => void
}

/**
 * Create a new agent
 */
export function useCreateAgent(options: UseCreateAgentOptions = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    ...postApiAgentsMutation({ client: apiClient }),
    onSuccess: (data) => {
      // Invalidate agents list to refetch
      queryClient.invalidateQueries({ queryKey: getApiAgentsQueryKey() })
      options.onSuccess?.(data)
    },
    onError: (error) => {
      options.onError?.(error)
    },
  })
}

export interface UseUpdateAgentOptions {
  /** Enable optimistic updates for instant UI feedback */
  optimistic?: boolean
  onSuccess?: (agent: AgentDefinition) => void
  onError?: (error: _Error) => void
}

/**
 * Update an existing agent with optional optimistic updates
 */
export function useUpdateAgent(options: UseUpdateAgentOptions = {}) {
  const queryClient = useQueryClient()
  const { optimistic = false } = options

  return useMutation({
    ...putApiAgentsByAgentIdMutation({ client: apiClient }),
    onMutate: optimistic
      ? async (variables) => {
          // Cancel outgoing refetches
          await queryClient.cancelQueries({ queryKey: getApiAgentsQueryKey() })
          await queryClient.cancelQueries({
            queryKey: getApiAgentsByAgentIdQueryKey({
              client: apiClient,
              path: { agentId: variables.path.agentId },
            }),
          })

          // Snapshot previous values
          const previousAgent = queryClient.getQueryData<AgentDefinition>(
            getApiAgentsByAgentIdQueryKey({
              client: apiClient,
              path: { agentId: variables.path.agentId },
            })
          )
          const previousAgents = queryClient.getQueryData<AgentListResponse>(
            getApiAgentsQueryKey()
          )

          // Optimistically update single agent
          if (previousAgent) {
            queryClient.setQueryData<AgentDefinition>(
              getApiAgentsByAgentIdQueryKey({
                client: apiClient,
                path: { agentId: variables.path.agentId },
              }),
              { ...previousAgent, ...variables.body, updatedAt: new Date().toISOString() }
            )
          }

          // Optimistically update agents list
          if (previousAgents) {
            queryClient.setQueryData<AgentListResponse>(getApiAgentsQueryKey(), {
              ...previousAgents,
              agents: previousAgents.agents.map((agent) =>
                agent.id === variables.path.agentId
                  ? { ...agent, ...variables.body, updatedAt: new Date().toISOString() }
                  : agent
              ),
            })
          }

          return { previousAgent, previousAgents }
        }
      : undefined,
    onError: (error, variables, context) => {
      // Rollback on error
      if (optimistic && context) {
        if (context.previousAgent) {
          queryClient.setQueryData(
            getApiAgentsByAgentIdQueryKey({
              client: apiClient,
              path: { agentId: variables.path.agentId },
            }),
            context.previousAgent
          )
        }
        if (context.previousAgents) {
          queryClient.setQueryData(getApiAgentsQueryKey(), context.previousAgents)
        }
      }
      options.onError?.(error)
    },
    onSettled: (_, __, variables) => {
      // Refetch to ensure server state
      queryClient.invalidateQueries({ queryKey: getApiAgentsQueryKey() })
      queryClient.invalidateQueries({
        queryKey: getApiAgentsByAgentIdQueryKey({
          client: apiClient,
          path: { agentId: variables.path.agentId },
        }),
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
    },
  })
}

export interface UseDeleteAgentOptions {
  /** Enable optimistic updates for instant UI feedback */
  optimistic?: boolean
  onSuccess?: () => void
  onError?: (error: _Error) => void
}

/**
 * Delete an agent with optional optimistic updates
 */
export function useDeleteAgent(options: UseDeleteAgentOptions = {}) {
  const queryClient = useQueryClient()
  const { optimistic = false } = options

  return useMutation({
    ...deleteApiAgentsByAgentIdMutation({ client: apiClient }),
    onMutate: optimistic
      ? async (variables) => {
          // Cancel outgoing refetches
          await queryClient.cancelQueries({ queryKey: getApiAgentsQueryKey() })

          // Snapshot previous value
          const previousAgents = queryClient.getQueryData<AgentListResponse>(
            getApiAgentsQueryKey()
          )

          // Optimistically remove from list
          if (previousAgents) {
            queryClient.setQueryData<AgentListResponse>(getApiAgentsQueryKey(), {
              ...previousAgents,
              agents: previousAgents.agents.filter(
                (agent) => agent.id !== variables.path.agentId
              ),
              total: previousAgents.total - 1,
            })
          }

          return { previousAgents }
        }
      : undefined,
    onError: (error, _variables, context) => {
      // Rollback on error
      if (optimistic && context?.previousAgents) {
        queryClient.setQueryData(getApiAgentsQueryKey(), context.previousAgents)
      }
      options.onError?.(error)
    },
    onSettled: (_, __, variables) => {
      // Invalidate and remove from cache
      queryClient.invalidateQueries({ queryKey: getApiAgentsQueryKey() })
      queryClient.removeQueries({
        queryKey: getApiAgentsByAgentIdQueryKey({
          client: apiClient,
          path: { agentId: variables.path.agentId },
        }),
      })
    },
    onSuccess: () => {
      options.onSuccess?.()
    },
  })
}
