import {
  parseErrorEnvelope,
  parseEventQuery,
  parseImpactVectorQuery,
  parseScenarioScoreRequest,
  ValidationError,
  type MacroInput,
  type ScenarioAssumptions,
} from './contracts';
import {
  buildEventFeed,
  buildImpactVector,
  calculateAssumptionCoverage,
  computeFreshness,
  normalizeMacroInput,
  propagateConfidence,
  scoreScenario,
  toConfidenceBand,
} from './domain';

export type MacroApiAppOptions = {
  now?: () => Date;
  cacheTtlMs?: number;
  staleAfterMs?: number;
  prices?: {
    events: string;
    impactVectors: string;
    scenarioScore: string;
  };
  paywall?: {
    enabled: boolean;
    middlewareFactory?: () => PaywallMiddleware;
  };
};

type CachedValue = {
  createdAtMs: number;
  payload: unknown;
};

type RouteKey = `${'GET' | 'POST'} ${string}`;

type RouteHandler = (request: Request) => Promise<Response>;

type PaywallMiddleware = (
  request: Request,
  next: () => Promise<Response>
) => Promise<Response | void>;

const DEFAULT_PRICES = {
  events: '5000',
  impactVectors: '9000',
  scenarioScore: '14000',
};

const DEFAULT_STALE_AFTER_MS = 90 * 60 * 1000;
const DEFAULT_CACHE_TTL_MS = 30 * 1000;

function parseListParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseMacroQuery(url: URL): {
  eventTypes: string[];
  geography: string;
  sectorSet: string[];
  horizon: string;
} {
  return {
    eventTypes: parseListParam(url.searchParams.get('eventTypes')),
    geography: url.searchParams.get('geography') ?? '',
    sectorSet: parseListParam(url.searchParams.get('sectorSet')),
    horizon: url.searchParams.get('horizon') ?? '',
  };
}

function clampAssumptions(input?: ScenarioAssumptions): ScenarioAssumptions {
  return {
    inflationShock: input?.inflationShock ?? 0,
    oilShock: input?.oilShock ?? 0,
    policySurprise: input?.policySurprise ?? 0,
    demandShock: input?.demandShock ?? 0,
  };
}

function normalizeInputFromRaw(raw: {
  eventTypes: string[];
  geography: string;
  sectorSet: string[];
  horizon: string;
}): MacroInput {
  return normalizeMacroInput(raw);
}

function errorJson(code: string, message: string, details?: unknown, status = 400): Response {
  const payload = { error: { code, message, details } };
  parseErrorEnvelope(payload);
  return Response.json(payload, { status });
}

function defaultX402Middleware(path: string, price: string): PaywallMiddleware {
  return async (request, next) => {
    const payment = request.headers.get('X-PAYMENT') ?? request.headers.get('PAYMENT');
    if (!payment) {
      return Response.json(
        {
          error: {
            code: 'payment_required',
            message: 'x402 payment required',
          },
          accepts: [
            {
              method: 'x402',
              endpoint: path,
              price,
            },
          ],
        },
        { status: 402 }
      );
    }

    return next();
  };
}

function withPaywall(
  baseHandler: RouteHandler,
  middleware: PaywallMiddleware | undefined
): RouteHandler {
  if (!middleware) return baseHandler;

  return async request => {
    let nextResult: Response | undefined;
    const result = await middleware(request, async () => {
      const response = await baseHandler(request);
      nextResult = response;
      return response;
    });
    if (result instanceof Response) {
      return result;
    }
    if (nextResult) {
      return nextResult;
    }
    return baseHandler(request);
  };
}

export async function createMacroApiApp(options: MacroApiAppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const prices = options.prices ?? DEFAULT_PRICES;

  const cache = new Map<string, CachedValue>();
  const routes = new Map<RouteKey, RouteHandler>();

  const registerRoute = (
    method: 'GET' | 'POST',
    path: string,
    price: string,
    handler: RouteHandler
  ): void => {
    const paywallMiddleware = options.paywall?.enabled
      ? (options.paywall.middlewareFactory?.() ?? defaultX402Middleware(path, price))
      : undefined;

    routes.set(`${method} ${path}`, withPaywall(handler, paywallMiddleware));
  };

  registerRoute('GET', '/v1/macro/events', prices.events, async request => {
    try {
      const queryRaw = parseMacroQuery(new URL(request.url));
      const parsed = parseEventQuery({
        ...queryRaw,
        sectorSet: queryRaw.sectorSet.length > 0 ? queryRaw.sectorSet : undefined,
      });

      const input = normalizeInputFromRaw({
        ...parsed,
        sectorSet:
          parsed.sectorSet?.length && parsed.sectorSet.length > 0
            ? parsed.sectorSet
            : ['EQUITIES'],
      });

      const current = now();
      const eventFeed = buildEventFeed(input, current);
      const oldestAsOf = eventFeed.reduce((acc, item) => {
        const t = new Date(item.as_of);
        return t.getTime() < acc.getTime() ? t : acc;
      }, new Date(eventFeed[0].as_of));

      const freshness = computeFreshness({
        asOf: oldestAsOf,
        now: current,
        maxAgeMs: staleAfterMs,
      });

      const confidence = propagateConfidence({
        base: 0.84,
        freshnessPenalty: freshness.is_stale ? 0.35 : 0.05,
        assumptionCoverage: 1,
      });

      return Response.json({
        api_version: 'v1',
        event_feed: eventFeed,
        freshness,
        confidence,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return errorJson('invalid_request', error.message, error.issues, 400);
      }
      return errorJson('invalid_request', (error as Error).message, undefined, 400);
    }
  });

  registerRoute(
    'GET',
    '/v1/macro/impact-vectors',
    prices.impactVectors,
    async request => {
      try {
        const queryRaw = parseMacroQuery(new URL(request.url));
        const parsed = parseImpactVectorQuery(queryRaw);
        const input = normalizeInputFromRaw(parsed);
        const cacheKey = JSON.stringify({ route: 'impact-vectors', input });

        const nowMs = now().getTime();
        const cached = cache.get(cacheKey);
        if (cached && nowMs - cached.createdAtMs <= cacheTtlMs) {
          return Response.json(cached.payload);
        }

        const current = new Date(nowMs);
        const eventFeed = buildEventFeed(input, current);
        const vector = buildImpactVector(input);
        const oldestAsOf = eventFeed.reduce((acc, item) => {
          const t = new Date(item.as_of);
          return t.getTime() < acc.getTime() ? t : acc;
        }, new Date(eventFeed[0].as_of));

        const freshness = computeFreshness({
          asOf: oldestAsOf,
          now: current,
          maxAgeMs: staleAfterMs,
        });

        const confidence = propagateConfidence({
          base: 0.8,
          freshnessPenalty: freshness.is_stale ? 0.4 : 0.08,
          assumptionCoverage: 1,
        });

        const payload = {
          api_version: 'v1',
          impact_vector: {
            sectors: vector.sectors,
            assets: vector.assets,
            supply_chain: vector.supply_chain,
          },
          confidence_band: toConfidenceBand(confidence.score),
          sensitivity_breakdown: vector.sensitivity_breakdown,
          freshness,
          confidence,
        };

        cache.set(cacheKey, {
          createdAtMs: nowMs,
          payload,
        });

        return Response.json(payload);
      } catch (error) {
        if (error instanceof ValidationError) {
          return errorJson('invalid_request', error.message, error.issues, 400);
        }
        return errorJson('invalid_request', (error as Error).message, undefined, 400);
      }
    }
  );

  registerRoute('POST', '/v1/macro/scenario-score', prices.scenarioScore, async request => {
    try {
      const body = await request.json();
      const parsed = parseScenarioScoreRequest(body);
      const input = normalizeInputFromRaw(parsed);
      const assumptions = clampAssumptions(parsed.scenarioAssumptions);
      const current = now();

      const eventFeed = buildEventFeed(input, current);
      const vector = buildImpactVector(input);
      const scenario = scoreScenario(input, assumptions);
      const oldestAsOf = eventFeed.reduce((acc, item) => {
        const t = new Date(item.as_of);
        return t.getTime() < acc.getTime() ? t : acc;
      }, new Date(eventFeed[0].as_of));

      const freshness = computeFreshness({
        asOf: oldestAsOf,
        now: current,
        maxAgeMs: staleAfterMs,
      });

      const confidence = propagateConfidence({
        base: 0.77,
        freshnessPenalty: freshness.is_stale ? 0.4 : 0.1,
        assumptionCoverage: calculateAssumptionCoverage(parsed.scenarioAssumptions),
      });

      return Response.json({
        api_version: 'v1',
        scenario_score: scenario,
        impact_vector: {
          sectors: vector.sectors,
          assets: vector.assets,
          supply_chain: vector.supply_chain,
        },
        confidence_band: toConfidenceBand(confidence.score),
        sensitivity_breakdown: vector.sensitivity_breakdown,
        freshness,
        confidence,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return errorJson('invalid_request', error.message, error.issues, 400);
      }
      return errorJson('invalid_request', (error as Error).message, undefined, 400);
    }
  });

  return {
    app: {
      request: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        const route = routes.get(`${request.method.toUpperCase()} ${url.pathname}` as RouteKey);
        if (!route) {
          return errorJson('not_found', 'Route not found', undefined, 404);
        }
        return route(request);
      },
    },
  };
}

export async function runMacroApiServer() {
  const { app } = await createMacroApiApp({
    paywall: { enabled: true },
  });

  const port = Number(process.env.PORT ?? 3000);
  console.log(`[macro-data-api] listening on :${port}`);

  return Bun.serve({
    port,
    fetch: app.request,
  });
}
