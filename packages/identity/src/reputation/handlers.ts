import type {
  ErrorCode,
  ErrorResponse,
} from './schemas';
import {
  HistoryRequestSchema,
  HistoryResponseSchema,
  ReputationRequestSchema,
  ReputationResponseSchema,
  TrustBreakdownRequestSchema,
  TrustBreakdownResponseSchema,
} from './schemas';
import type { ReputationService } from './service';

// ============================================================================
// Error Helpers
// ============================================================================

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  const now = new Date().toISOString();
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
    freshness: {
      lastUpdated: now,
      dataAge: 0,
      source: 'cache',
    },
    confidence: {
      level: 'low',
      score: 0,
      factors: ['error_response'],
    },
  };
}

export function jsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

// ============================================================================
// Request Parsing
// ============================================================================

function parseQueryParams(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function parseNumericParam(
  params: Record<string, string>,
  key: string
): number | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value.trim())) return NaN;
  return Number(value);
}

// Helper to extract first error from Zod result (v4 compatible)
type ZodIssueLike = { path?: (string | number)[]; message?: string };
type ZodErrorLike = { issues?: ZodIssueLike[]; errors?: ZodIssueLike[] };

function getFirstZodError(error: unknown): { path: (string | number)[]; message: string } | undefined {
  // Zod v4 uses .issues, Zod v3 uses .errors
  const e = (error ?? {}) as ZodErrorLike;
  const issues = e.issues ?? e.errors ?? [];
  if (issues.length > 0) {
    return { path: issues[0].path ?? [], message: issues[0].message ?? 'Validation error' };
  }
  return undefined;
}

// ============================================================================
// Handler Factory
// ============================================================================

export type ReputationHandlerConfig = {
  service: ReputationService;
  requirePayment?: boolean;
  checkPayment?: (request: Request) => Promise<boolean>;
};

export function createReputationHandlers(config: ReputationHandlerConfig) {
  const { service, requirePayment = false, checkPayment } = config;

  async function verifyPayment(request: Request): Promise<ErrorResponse | null> {
    if (!requirePayment) return null;

    // Fail-closed: if payment required but no checker configured, reject
    if (!checkPayment) {
      return createErrorResponse(
        'PAYMENT_REQUIRED',
        'Payment verification not configured',
        { x402: true }
      );
    }

    try {
      const paid = await checkPayment(request);
      if (!paid) {
        return createErrorResponse(
          'PAYMENT_REQUIRED',
          'Payment required to access this endpoint',
          { x402: true }
        );
      }
    } catch {
      return createErrorResponse(
        'PAYMENT_REQUIRED',
        'Payment verification failed',
        { x402: true }
      );
    }
    return null;
  }

  return {
    /**
     * GET /v1/identity/reputation
     */
    async handleReputation(request: Request): Promise<Response> {
      // Check payment
      const paymentError = await verifyPayment(request);
      if (paymentError) {
        return jsonResponse(paymentError, 402);
      }

      // Parse request
      const url = new URL(request.url);
      const params = parseQueryParams(url);

      const parseResult = ReputationRequestSchema.safeParse({
        agentAddress: params.agentAddress,
        chain: params.chain,
        timeframe: params.timeframe,
        evidenceDepth: params.evidenceDepth,
      });

      if (!parseResult.success) {
        const firstError = getFirstZodError(parseResult.error);
        const field = firstError?.path[0] as string | undefined;
        
        let code: ErrorCode = 'INTERNAL_ERROR';
        if (field === 'agentAddress') code = 'INVALID_ADDRESS';
        else if (field === 'chain') code = 'INVALID_CHAIN';
        else if (field === 'timeframe') code = 'INVALID_TIMEFRAME';

        return jsonResponse(
          createErrorResponse(code, firstError?.message || 'Invalid request', {
            field: field ?? 'unknown',
          }),
          400
        );
      }

      try {
        const response = await service.getReputation(parseResult.data);
        
        // Validate response shape
        const validated = ReputationResponseSchema.parse(response);
        return jsonResponse(validated, 200);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return jsonResponse(
            createErrorResponse('AGENT_NOT_FOUND', error.message),
            404
          );
        }
        return jsonResponse(
          createErrorResponse('INTERNAL_ERROR', 'Failed to fetch reputation data'),
          500
        );
      }
    },

    /**
     * GET /v1/identity/history
     */
    async handleHistory(request: Request): Promise<Response> {
      const paymentError = await verifyPayment(request);
      if (paymentError) {
        return jsonResponse(paymentError, 402);
      }

      const url = new URL(request.url);
      const params = parseQueryParams(url);

      const parseResult = HistoryRequestSchema.safeParse({
        agentAddress: params.agentAddress,
        chain: params.chain,
        limit: parseNumericParam(params, 'limit'),
        offset: parseNumericParam(params, 'offset'),
      });

      if (!parseResult.success) {
        const firstError = getFirstZodError(parseResult.error);
        const field = firstError?.path[0] as string | undefined;

        let code: ErrorCode = 'INTERNAL_ERROR';
        if (field === 'agentAddress') code = 'INVALID_ADDRESS';
        else if (field === 'chain') code = 'INVALID_CHAIN';

        return jsonResponse(
          createErrorResponse(code, firstError?.message || 'Invalid request', {
            field: field ?? 'unknown',
          }),
          400
        );
      }

      try {
        const response = await service.getHistory(parseResult.data);
        const validated = HistoryResponseSchema.parse(response);
        return jsonResponse(validated, 200);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return jsonResponse(
            createErrorResponse('AGENT_NOT_FOUND', error.message),
            404
          );
        }
        return jsonResponse(
          createErrorResponse('INTERNAL_ERROR', 'Failed to fetch history data'),
          500
        );
      }
    },

    /**
     * GET /v1/identity/trust-breakdown
     */
    async handleTrustBreakdown(request: Request): Promise<Response> {
      const paymentError = await verifyPayment(request);
      if (paymentError) {
        return jsonResponse(paymentError, 402);
      }

      const url = new URL(request.url);
      const params = parseQueryParams(url);

      const parseResult = TrustBreakdownRequestSchema.safeParse({
        agentAddress: params.agentAddress,
        chain: params.chain,
        timeframe: params.timeframe,
      });

      if (!parseResult.success) {
        const firstError = getFirstZodError(parseResult.error);
        const field = firstError?.path[0] as string | undefined;

        let code: ErrorCode = 'INTERNAL_ERROR';
        if (field === 'agentAddress') code = 'INVALID_ADDRESS';
        else if (field === 'chain') code = 'INVALID_CHAIN';
        else if (field === 'timeframe') code = 'INVALID_TIMEFRAME';

        return jsonResponse(
          createErrorResponse(code, firstError?.message || 'Invalid request', {
            field: field ?? 'unknown',
          }),
          400
        );
      }

      try {
        const response = await service.getTrustBreakdown(parseResult.data);
        const validated = TrustBreakdownResponseSchema.parse(response);
        return jsonResponse(validated, 200);
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          return jsonResponse(
            createErrorResponse('AGENT_NOT_FOUND', error.message),
            404
          );
        }
        return jsonResponse(
          createErrorResponse('INTERNAL_ERROR', 'Failed to fetch trust breakdown'),
          500
        );
      }
    },
  };
}

export type ReputationHandlers = ReturnType<typeof createReputationHandlers>;
