import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Stale time of 1 minute for most queries
        staleTime: 1000 * 60,
        // Retry failed requests up to 3 times
        retry: 3,
        // Don't refetch on window focus in development
        refetchOnWindowFocus: import.meta.env.PROD,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  })
  return {
    queryClient,
  }
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
