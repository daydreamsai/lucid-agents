import { join } from 'node:path';

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import {
  createRuntimePaymentContext,
  payments,
  paymentsFromEnv,
} from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';
import { z } from 'zod';

const DEFAULT_PREFLIGHT_URL =
  process.env.X402STATION_PREFLIGHT_URL ??
  'https://x402station.io/api/v1/preflight-trial';

const PreflightVerdictSchema = z
  .object({
    ok: z.boolean(),
    warnings: z.array(z.string()).default([]),
    recommended_action: z.string().optional(),
    risk_score: z.number().optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

type PreflightVerdict = z.infer<typeof PreflightVerdictSchema>;

type FetchInput = string | URL | Request;

type FetchLike = (input: FetchInput, init?: RequestInit) => Promise<Response>;

function buildEntrypointInvokeUrl(baseUrl: string, endpoint: string): string {
  const normalizedEndpoint = endpoint.trim().replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedEndpoint)) {
    throw new Error(
      'endpoint must contain only letters, numbers, underscores, or dashes'
    );
  }

  return new URL(
    `/entrypoints/${normalizedEndpoint}/invoke`,
    baseUrl
  ).toString();
}

async function runPreflight(
  fetchImpl: FetchLike,
  targetUrl: string
): Promise<PreflightVerdict> {
  const response = await fetchImpl(DEFAULT_PREFLIGHT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetUrl }),
  });

  if (!response.ok) {
    throw new Error(`x402station.io preflight failed: HTTP ${response.status}`);
  }

  return PreflightVerdictSchema.parse(await response.json());
}

function shouldBlockPayment(verdict: PreflightVerdict): boolean {
  return (
    !verdict.ok ||
    verdict.recommended_action === 'skip' ||
    verdict.recommended_action === 'use_alternatives'
  );
}

function preflightSummary(verdict: PreflightVerdict) {
  return {
    ok: verdict.ok,
    warnings: verdict.warnings,
    recommended_action: verdict.recommended_action,
    risk_score: verdict.risk_score,
    confidence: verdict.confidence,
  };
}

/**
 * Agent that demonstrates external x402 endpoint preflight before payment.
 *
 * Lucid payment policies still enforce local budget and recipient rules.
 * x402station.io Preflight adds an independent risk signal before the same
 * payment-enabled fetch signs PAYMENT-SIGNATURE for an unfamiliar endpoint.
 *
 * Run: bun run packages/examples/src/payments/x402station-preflight
 */
const agent = await createAgent({
  name: 'x402station-preflight-agent',
  version: '1.0.0',
  description:
    'Agent demonstrating x402station.io Preflight before Lucid outbound payments',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
      policies: join(import.meta.dir, '..', 'payment-policies.json'),
    })
  )
  .use(
    wallets({
      config: walletsFromEnv(),
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'delegate-with-preflight',
  description:
    'Calls a paid agent endpoint only after x402station.io Preflight allows it',
  input: z.object({
    targetUrl: z.string().url(),
    endpoint: z.string().default('echo'),
    data: z.unknown().optional(),
  }),
  output: z.object({
    blocked: z.boolean(),
    target: z.string(),
    preflight: z.object({
      ok: z.boolean(),
      warnings: z.array(z.string()),
      recommended_action: z.string().optional(),
      risk_score: z.number().optional(),
      confidence: z.number().optional(),
    }),
    result: z.unknown().optional(),
    paymentPolicy: z.string(),
  }),
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.payments) {
      throw new Error('Payments not configured');
    }

    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: runtime.payments.config.network,
    });

    if (!paymentContext.fetchWithPayment) {
      throw new Error('Payment context not available');
    }

    const target = buildEntrypointInvokeUrl(
      ctx.input.targetUrl,
      ctx.input.endpoint
    );
    const preflight = await runPreflight(
      paymentContext.fetchWithPayment,
      target
    );

    if (shouldBlockPayment(preflight)) {
      return {
        output: {
          blocked: true,
          target,
          preflight: preflightSummary(preflight),
          paymentPolicy:
            'No payment attempted. x402station.io Preflight refused the target before PAYMENT-SIGNATURE.',
        },
      };
    }

    const response = await paymentContext.fetchWithPayment(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx.input.data ?? { input: {} }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        const error = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
          reason?: string;
        };
        throw new Error(
          error.error?.message || error.reason || 'Payment blocked by policy'
        );
      }
      throw new Error(`Request failed: ${response.status}`);
    }

    const result = (await response.json()) as unknown;

    return {
      output: {
        blocked: false,
        target,
        preflight: preflightSummary(preflight),
        result,
        paymentPolicy:
          'x402station.io Preflight allowed the target; Lucid payment policies passed before settlement.',
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3004);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `x402station preflight agent ready at http://${server.hostname}:${server.port}/.well-known/agent.json`
);
