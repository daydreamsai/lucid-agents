import { Hono } from 'hono';
import { QuoteRequestSchema } from './schemas/quote';
import { ForecastRequestSchema } from './schemas/forecast';
import { CongestionRequestSchema } from './schemas/congestion';
import { handleQuote } from './handlers/quote';
import { handleForecast } from './handlers/forecast';
import { handleCongestion } from './handlers/congestion';
import { MockProvider } from './providers/mock-provider';
import type { ChainDataProvider } from './providers/types';
import { CHAIN_CONFIGS } from './config';
import type { Chain } from './schemas/common';

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  chain: Chain;
}

// Track all cache instances for clearCache
const allCaches: Set<Map<string, CacheEntry<unknown>>> = new Set();

export function clearCache(): void {
  for (const cache of allCaches) {
    cache.clear();
  }
}

// ─── Error Helper ────────────────────────────────────────────────────────────

function errorResponse(code: number, message: string, details?: string) {
  return {
    code,
    message,
    details,
    request_id: crypto.randomUUID(),
  };
}

// ─── App Factory ─────────────────────────────────────────────────────────────

export interface CreateAppOptions {
  provider?: ChainDataProvider;
  requirePayment?: boolean;
  rateLimitPerMinute?: number;
}

export function createApp(options: CreateAppOptions = {}) {
  const provider = options.provider ?? new MockProvider();
  const requirePayment = options.requirePayment ?? true;

  const cache = new Map<string, CacheEntry<unknown>>();
  allCaches.add(cache);

  function getCached<T>(key: string, chain: Chain): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    const ttl = CHAIN_CONFIGS[chain].cache_ttl_ms;
    if (Date.now() - entry.timestamp > ttl) {
      cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  function setCache<T>(key: string, chain: Chain, data: T): void {
    cache.set(key, { data, timestamp: Date.now(), chain });
  }

  const app = new Hono();

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // POST /entrypoints/gas-quote/invoke
  app.post('/entrypoints/gas-quote/invoke', async (c) => {
    try {
      if (requirePayment) {
        const payment = c.req.header('x-payment');
        if (!payment) {
          return c.json(errorResponse(402, 'Payment required', 'Include X-PAYMENT header'), 402);
        }
      }

      const body = await c.req.json();
      const parsed = QuoteRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(errorResponse(400, 'Invalid request', parsed.error.message), 400);
      }

      const input = parsed.data;
      const cacheKey = `quote:${input.chain}:${input.urgency}:${input.tx_type}:${input.recent_failure_tolerance}`;
      const cached = getCached<any>(cacheKey, input.chain);
      if (cached) {
        return c.json({ ...cached, freshness: { ...cached.freshness, data_source: 'cached' } });
      }

      const result = await handleQuote(input, provider);
      setCache(cacheKey, input.chain, result);
      return c.json(result);
    } catch (err) {
      return c.json(errorResponse(500, 'Internal server error', String(err)), 500);
    }
  });

  // POST /entrypoints/gas-forecast/invoke
  app.post('/entrypoints/gas-forecast/invoke', async (c) => {
    try {
      if (requirePayment) {
        const payment = c.req.header('x-payment');
        if (!payment) {
          return c.json(errorResponse(402, 'Payment required', 'Include X-PAYMENT header'), 402);
        }
      }

      const body = await c.req.json();
      const parsed = ForecastRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(errorResponse(400, 'Invalid request', parsed.error.message), 400);
      }

      const input = parsed.data;
      const cacheKey = `forecast:${input.chain}:${input.target_blocks}`;
      const cached = getCached<any>(cacheKey, input.chain);
      if (cached) {
        return c.json({ ...cached, freshness: { ...cached.freshness, data_source: 'cached' } });
      }

      const result = await handleForecast(input, provider);
      setCache(cacheKey, input.chain, result);
      return c.json(result);
    } catch (err) {
      return c.json(errorResponse(500, 'Internal server error', String(err)), 500);
    }
  });

  // POST /entrypoints/gas-congestion/invoke
  app.post('/entrypoints/gas-congestion/invoke', async (c) => {
    try {
      if (requirePayment) {
        const payment = c.req.header('x-payment');
        if (!payment) {
          return c.json(errorResponse(402, 'Payment required', 'Include X-PAYMENT header'), 402);
        }
      }

      const body = await c.req.json();
      const parsed = CongestionRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(errorResponse(400, 'Invalid request', parsed.error.message), 400);
      }

      const input = parsed.data;
      const cacheKey = `congestion:${input.chain}`;
      const cached = getCached<any>(cacheKey, input.chain);
      if (cached) {
        return c.json({ ...cached, freshness: { ...cached.freshness, data_source: 'cached' } });
      }

      const result = await handleCongestion(input, provider);
      setCache(cacheKey, input.chain, result);
      return c.json(result);
    } catch (err) {
      return c.json(errorResponse(500, 'Internal server error', String(err)), 500);
    }
  });

  return app;
}

// Start server if run directly
if (import.meta.main) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`Gas Oracle running at http://localhost:${port}`);
}
