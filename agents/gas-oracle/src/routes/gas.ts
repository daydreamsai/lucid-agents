import { Hono } from 'hono';
import {
  GasQuoteQuerySchema,
  GasForecastQuerySchema,
  CongestionQuerySchema,
} from '../schemas/index.js';
import type {
  GasQuoteResponse,
  GasForecastResponse,
  CongestionResponse,
} from '../schemas/index.js';
import {
  estimateFees,
  buildInclusionCurve,
  buildForecast,
  estimateWaitSeconds,
} from '../logic/gas-estimation.js';
import { analyseCongestion } from '../logic/congestion-analysis.js';
import { resolveRpcUrl, getLatestBlock, getMempoolStatus } from '../logic/rpc-client.js';

export const gasRoutes = new Hono();

// GET /v1/gas/quote
gasRoutes.get('/quote', async c => {
  const parseResult = GasQuoteQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams)
  );
  if (!parseResult.success) {
    return c.json({ error: { code: 'validation_error', message: parseResult.error.message } }, 400);
  }

  const fetchStart = Date.now();
  const query = parseResult.data;

  try {
    const rpcUrl = resolveRpcUrl(query.chain);
    const block = await getLatestBlock(rpcUrl);
    const baseFeeWei = block.baseFeePerGas ?? BigInt(20e9);
    const freshness_ms = Date.now() - fetchStart;

    const { recommendedMaxFeeWei, priorityFeeWei } = estimateFees(baseFeeWei, query.urgency);
    const curve = buildInclusionCurve(query.urgency);
    const waitSeconds = estimateWaitSeconds(query.urgency);

    const response: GasQuoteResponse = {
      chain: query.chain,
      urgency: query.urgency,
      recommended_max_fee: recommendedMaxFeeWei.toString(),
      priority_fee: priorityFeeWei.toString(),
      base_fee: baseFeeWei.toString(),
      inclusion_probability_curve: curve,
      confidence_score: 0.92,
      freshness_ms,
      tx_type: query.txType,
      estimated_wait_seconds: waitSeconds,
    };

    return c.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return c.json({ error: { code: 'oracle_error', message } }, 500);
  }
});

// GET /v1/gas/forecast
gasRoutes.get('/forecast', async c => {
  const parseResult = GasForecastQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams)
  );
  if (!parseResult.success) {
    return c.json({ error: { code: 'validation_error', message: parseResult.error.message } }, 400);
  }

  const fetchStart = Date.now();
  const query = parseResult.data;

  try {
    const rpcUrl = resolveRpcUrl(query.chain);
    const block = await getLatestBlock(rpcUrl);
    const baseFeeWei = block.baseFeePerGas ?? BigInt(20e9);
    const baseFeeGwei = Number(baseFeeWei) / 1e9;
    const freshness_ms = Date.now() - fetchStart;

    const forecast = buildForecast(baseFeeGwei, query.horizonMinutes, query.granularity, Date.now());

    const response: GasForecastResponse = {
      chain: query.chain,
      horizon_minutes: query.horizonMinutes,
      granularity_minutes: query.granularity,
      forecast,
      confidence_score: 0.75,
      freshness_ms,
    };

    return c.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return c.json({ error: { code: 'oracle_error', message } }, 500);
  }
});

// GET /v1/gas/congestion
gasRoutes.get('/congestion', async c => {
  const parseResult = CongestionQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams)
  );
  if (!parseResult.success) {
    return c.json({ error: { code: 'validation_error', message: parseResult.error.message } }, 400);
  }

  const fetchStart = Date.now();
  const { chain } = parseResult.data;

  try {
    const rpcUrl = resolveRpcUrl(chain);
    const [block, mempool] = await Promise.all([
      getLatestBlock(rpcUrl),
      getMempoolStatus(rpcUrl),
    ]);
    const baseFeeWei = block.baseFeePerGas ?? BigInt(20e9);
    const freshness_ms = Date.now() - fetchStart;

    const { congestion_state, utilisation_percent, confidence_score } =
      analyseCongestion({
        gasUsed: block.gasUsed,
        gasLimit: block.gasLimit,
        pendingTxCount: mempool.pendingTxCount,
        baseFeeWei,
      });

    const response: CongestionResponse = {
      chain,
      congestion_state,
      utilisation_percent,
      pending_tx_count: mempool.pendingTxCount,
      base_fee_gwei: parseFloat((Number(baseFeeWei) / 1e9).toFixed(4)),
      confidence_score,
      freshness_ms,
    };

    return c.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return c.json({ error: { code: 'oracle_error', message } }, 500);
  }
});
