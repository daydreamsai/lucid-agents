import {
  createClient,
  createConfig,
  type ClientOptions,
} from '@lucid-agents/hono-runtime/sdk/client'

const getBaseUrl = (): string => {
  // Vite environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // Fallback to localhost for development
  return 'http://localhost:8787'
}

export const apiClient = createClient(
  createConfig<ClientOptions>({
    baseUrl: getBaseUrl(),
  })
)

// Re-export client utilities for convenience
export { createClient, createConfig, type ClientOptions }
