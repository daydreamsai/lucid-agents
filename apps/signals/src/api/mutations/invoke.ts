import { useMutation } from '@tanstack/react-query'
import { postAgentsByAgentIdEntrypointsByKeyInvokeMutation } from '@lucid-agents/hono-runtime/sdk/react-query'
import { apiClient } from '../client'
import type { InvokeRequest, InvokeResponse, _Error } from '@lucid-agents/hono-runtime/sdk'

export interface UseInvokeEntrypointOptions {
  onSuccess?: (data: InvokeResponse) => void
  onError?: (error: _Error) => void
}

/**
 * Invoke an agent entrypoint
 */
export function useInvokeEntrypoint(options: UseInvokeEntrypointOptions = {}) {
  return useMutation({
    ...postAgentsByAgentIdEntrypointsByKeyInvokeMutation({ client: apiClient }),
    onSuccess: (data) => {
      options.onSuccess?.(data)
    },
    onError: (error) => {
      options.onError?.(error)
    },
  })
}

/**
 * Helper type for invoking an entrypoint
 */
export interface InvokeEntrypointParams {
  agentId: string
  entrypointKey: string
  input?: unknown
  sessionId?: string
  metadata?: Record<string, unknown>
}

/**
 * Convert helper params to SDK format
 */
export function toInvokeParams(params: InvokeEntrypointParams) {
  return {
    path: {
      agentId: params.agentId,
      key: params.entrypointKey,
    },
    body: {
      input: params.input,
      sessionId: params.sessionId,
      metadata: params.metadata,
    } satisfies InvokeRequest,
  }
}
