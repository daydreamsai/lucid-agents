import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';
import { getApiAgentsByAgentIdQueryKey } from '../queries/agents';
import { postApiAgentsByAgentIdIdentityRetryMutation } from '@lucid-agents/hono-runtime/sdk/react-query';
import type {
  IdentityRegistrationResult,
  PostApiAgentsByAgentIdIdentityRetryError,
} from '@lucid-agents/hono-runtime/sdk';

// Re-export type for convenience
export type { IdentityRegistrationResult };

export interface UseRetryIdentityRegistrationOptions {
  onSuccess?: (result: IdentityRegistrationResult) => void;
  onError?: (error: PostApiAgentsByAgentIdIdentityRetryError) => void;
}

/**
 * Retry identity registration for an agent
 */
export function useRetryIdentityRegistration(
  agentId: string,
  options: UseRetryIdentityRegistrationOptions = {}
) {
  const queryClient = useQueryClient();

  return useMutation({
    ...postApiAgentsByAgentIdIdentityRetryMutation({
      client: apiClient,
      path: { agentId },
    }),
    onSuccess: data => {
      // Invalidate agent query to refetch with updated metadata
      queryClient.invalidateQueries({
        queryKey: getApiAgentsByAgentIdQueryKey({
          client: apiClient,
          path: { agentId },
        }),
      });
      options.onSuccess?.(data);
    },
    onError: error => {
      options.onError?.(error);
    },
  });
}
