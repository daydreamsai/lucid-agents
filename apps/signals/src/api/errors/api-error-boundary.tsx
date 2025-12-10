import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import type { _Error } from '@lucid-agents/hono-runtime/sdk'

export interface ApiErrorFallbackProps extends FallbackProps {
  /** The API error if it's an API error */
  apiError?: _Error
}

/**
 * Default fallback component for API errors
 */
export function DefaultApiErrorFallback({
  error,
  resetErrorBoundary,
  apiError,
}: ApiErrorFallbackProps) {
  const errorMessage = apiError?.error ?? error?.message ?? 'An unexpected error occurred'
  const errorCode = apiError?.code

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-destructive">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="text-muted-foreground text-sm">{errorMessage}</p>
        {errorCode && (
          <p className="text-muted-foreground text-xs mt-1">Code: {errorCode}</p>
        )}
      </div>
      <button
        onClick={resetErrorBoundary}
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  )
}

/**
 * Check if an error is an API error
 */
export function isApiError(error: unknown): error is _Error {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as _Error).error === 'string'
  )
}

export interface ApiErrorBoundaryProps {
  children: React.ReactNode
  /** Custom fallback component */
  fallback?: React.ComponentType<ApiErrorFallbackProps>
  /** Called when the error boundary resets */
  onReset?: () => void
  /** Called when an error is caught */
  onError?: (error: Error, info: React.ErrorInfo) => void
}

/**
 * Error boundary that integrates with React Query's error reset
 *
 * @example
 * ```tsx
 * <ApiErrorBoundary>
 *   <Suspense fallback={<Loading />}>
 *     <AgentsList />
 *   </Suspense>
 * </ApiErrorBoundary>
 * ```
 */
export function ApiErrorBoundary({
  children,
  fallback: FallbackComponent = DefaultApiErrorFallback,
  onReset,
  onError,
}: ApiErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={() => {
            reset()
            onReset?.()
          }}
          onError={onError}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <FallbackComponent
              error={error}
              resetErrorBoundary={resetErrorBoundary}
              apiError={isApiError(error) ? error : undefined}
            />
          )}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
