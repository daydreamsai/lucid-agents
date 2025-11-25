/*
 * Minimal end-to-end example that exercises every major capability exposed by
 * @lucid/agent-kit:
 *   1. ERC-8004 identity bootstrap + trust manifest wiring
 *   2. Payments + AP2 manifest extension
 *   3. Streaming + standard entrypoints registered via createAgentApp
 *
 * The script is safe to run even if you do not have all dependencies configured;
 * it will degrade gracefully and surface TODOs in the console. See
 * examples/README.md for the list of environment variables it understands.
 */

import { z } from 'zod';
import { createAgentApp } from '@lucid-agents/hono';
import {
  createRuntimePaymentContext,
  type AgentKitConfig,
} from '@lucid-agents/core';
import {
  createAgentIdentity,
  getTrustConfig,
  type AgentIdentity,
} from '@lucid-agents/identity';
import {
  AgentRuntime,
  MemoryStorageAdapter,
  type AgentRuntimeWallet,
} from '@lucid-dreams/agent-auth';
import { privateKeyToAccount } from 'viem/accounts';

type RuntimeBootstrap = {
  runtime: AgentRuntime;
  accessToken: string;
  fetchWithPayment: typeof fetch;
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  scopes?: string[];
  baseUrl: string;
};

function parseScopes(input?: string | null): string[] | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const scopes = parsed
        .map(scope => (typeof scope === 'string' ? scope.trim() : ''))
        .filter(Boolean);
      return scopes.length ? scopes : undefined;
    }
  } catch {
    // fall back to comma-separated parsing
  }
  const scopes = trimmed
    .split(',')
    .map(scope => scope.trim())
    .filter(Boolean);
  return scopes.length ? scopes : undefined;
}

function normalizePrivateKey(value?: string | null): `0x${string}` | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const prefixed = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return prefixed as `0x${string}`;
}

async function setupAgentRuntime(options: {
  fetchImpl?: typeof fetch;
  network?: string;
}): Promise<RuntimeBootstrap | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    console.warn(
      '[examples] No fetch implementation available; skipping runtime auth bootstrap'
    );
    return null;
  }

  const baseUrl =
    process.env.LUCID_AGENT_BASE_URL ??
    process.env.AGENT_AUTH_BASE_URL ??
    process.env.API_BASE_URL;
  const agentRef = process.env.LUCID_AGENT_AGENT_REF ?? process.env.AGENT_REF;
  const credentialId =
    process.env.LUCID_AGENT_CREDENTIAL_ID ?? process.env.CREDENTIAL_ID;
  const refreshToken =
    process.env.LUCID_AGENT_REFRESH_TOKEN ?? process.env.REFRESH_TOKEN;
  const scopes =
    parseScopes(process.env.LUCID_AGENT_SCOPES) ??
    parseScopes(process.env.AGENT_SCOPES) ??
    parseScopes(process.env.SCOPES);
  const privateKey =
    process.env.AGENT_AUTH_PRIVATE_KEY ??
    process.env.AGENT_RUNTIME_PRIVATE_KEY ??
    process.env.PRIVATE_KEY;

  if (!baseUrl || !agentRef || !credentialId) {
    console.warn(
      '[examples] AgentRuntime auth skipped; provide LUCID_AGENT_BASE_URL, LUCID_AGENT_AGENT_REF, and LUCID_AGENT_CREDENTIAL_ID to enable challenge flow'
    );
    return null;
  }

  const normalizedKey = normalizePrivateKey(privateKey);
  if (!normalizedKey) {
    console.warn(
      '[examples] AgentRuntime auth skipped; AGENT_AUTH_PRIVATE_KEY (or PRIVATE_KEY) is required to sign challenges'
    );
    return null;
  }

  let account;
  try {
    account = privateKeyToAccount(normalizedKey);
  } catch (error) {
    console.warn(
      '[examples] Failed to initialise signer for AgentRuntime auth:',
      (error as Error)?.message ?? error
    );
    return null;
  }

  const wallet: AgentRuntimeWallet = {
    signer: {
      async signChallenge(challenge) {
        const payload = challenge.payload;
        if (typeof payload !== 'string' || !payload.length) {
          throw new Error(
            '[examples] Challenge payload must be a non-empty string'
          );
        }
        return account.signMessage({ message: payload });
      },
    },
  };

  try {
    const loadResult = await AgentRuntime.load({
      wallet,
      fetch: fetchImpl,
      storage: new MemoryStorageAdapter(),
      loader: {
        overrides: {
          baseUrl,
          agentRef,
          credentialId,
          refreshToken: refreshToken ?? undefined,
          scopes,
        },
      },
    });

    const runtime = loadResult.runtime;
    const accessToken = await runtime.ensureAccessToken();

    let fetchWithPayment: typeof fetch = fetchImpl;
    let walletAddress: `0x${string}` | null = null;
    let chainId: number | null = null;

    try {
      const paymentContext = await createRuntimePaymentContext({
        runtime,
        fetch: fetchImpl,
        network: options.network,
        logger: {
          warn(message, ...args) {
            console.warn('[examples] runtime payments:', message, ...args);
          },
        },
      });

      if (paymentContext.fetchWithPayment) {
        fetchWithPayment = paymentContext.fetchWithPayment;
      }
      walletAddress = paymentContext.walletAddress;
      chainId = paymentContext.chainId;
    } catch (error) {
      console.warn(
        '[examples] Failed to initialise runtime-backed paid fetch:',
        (error as Error)?.message ?? error
      );
    }

    return {
      runtime,
      accessToken,
      fetchWithPayment,
      walletAddress,
      chainId,
      scopes: loadResult.config.scopes,
      baseUrl,
    };
  } catch (error) {
    console.warn(
      '[examples] AgentRuntime auth bootstrap failed:',
      (error as Error)?.message ?? error
    );
    return null;
  }
}

async function main() {
  let runtime: AgentRuntime | undefined;

  try {
    const identity: AgentIdentity = await createAgentIdentity({
      domain: process.env.AGENT_DOMAIN,
      autoRegister: process.env.REGISTER_IDENTITY === 'true',
      chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined,
      registryAddress: process.env.IDENTITY_REGISTRY_ADDRESS as
        | `0x${string}`
        | undefined,
      rpcUrl: process.env.RPC_URL,
      privateKey: process.env.PRIVATE_KEY,
      trustModels: ['feedback', 'inference-validation', 'tee-attestation'],
      env: process.env as Record<string, string | undefined>,
      logger: {
        info(message) {
          console.log(`[examples] ${message}`);
        },
        warn(message, error) {
          if (error) {
            console.warn(`[examples] ${message}`, error);
          } else {
            console.warn(`[examples] ${message}`);
          }
        },
      },
    });

    const domain = identity.domain ?? process.env.AGENT_DOMAIN;

    console.log(`[examples] ${identity.status}`);

    if (identity.isNewRegistration && identity.transactionHash) {
      console.log(
        `[examples] Registered ${domain ?? 'agent'} on ERC-8004 (tx: ${
          identity.transactionHash
        }, agentId: ${identity.record?.agentId ?? 'unknown'})`
      );
    } else if (identity.record?.agentId) {
      console.log(
        `[examples] Found existing registration (agentId: ${identity.record.agentId})`
      );
    }

    if (!identity.trust) {
      console.warn(
        '[examples] Trust metadata unavailable; manifest will omit ERC-8004 entries'
      );
    }

    const configOverrides: AgentKitConfig = {
      payments: {
        facilitatorUrl:
          (process.env.FACILITATOR_URL as any) ??
          'https://facilitator.daydreams.systems',
        payTo:
          (process.env.PAYMENTS_RECEIVABLE_ADDRESS as `0x${string}`) ??
          '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
        network: (process.env.NETWORK as any) ?? 'base-sepolia',
      },
    };

    const { app, addEntrypoint } = createAgentApp(
      {
        name: 'all-in-one-agent',
        version: '0.1.0',
        description:
          'Demonstrates every feature exposed by @lucid/agent-kit. A2A, x402, ERC-8004, and more.',
      },
      {
        config: configOverrides,
        payments: configOverrides.payments,
        ap2: {
          roles: ['merchant', 'shopper'],
          description: 'Supports dual-role AP2 interactions',
        },
        trust: getTrustConfig(identity),
      }
    );

    addEntrypoint({
      key: 'echo',
      description: 'Returns the supplied text',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      async handler(ctx) {
        const text = String(ctx.input.text ?? '');
        console.log(`[examples] invoke echo -> ${text}`);
        return {
          output: { text },
          usage: { total_tokens: text.length },
          model: 'echo-v1',
        };
      },
    });

    addEntrypoint({
      key: 'stream',
      description: 'Streams characters back to the caller',
      input: z.object({ prompt: z.string() }),
      streaming: true,
      async stream(ctx, emit) {
        const prompt = String(ctx.input.prompt ?? '');
        console.log(`[examples] stream prompt -> ${prompt}`);
        for (const ch of prompt) {
          await emit({ kind: 'delta', delta: ch, mime: 'text/plain' });
        }
        await emit({
          kind: 'text',
          text: `Echo: ${prompt}`,
          mime: 'text/plain',
        });
        return {
          output: { done: true },
          usage: { total_tokens: prompt.length },
          model: 'stream-v1',
        };
      },
    });

    const port = Number(process.env.PORT ?? 8787);
    const agentOrigin = process.env.AGENT_ORIGIN ?? `https://localhost:${port}`;
    if (typeof Bun !== 'undefined') {
      Bun.serve({
        port,
        fetch: app.fetch,
      });
      console.log(`[examples] agent listening on https://localhost:${port}`);
    } else {
      console.warn(
        '[examples] Bun runtime not detected; skipping server start'
      );
    }

    const runtimeBootstrap = await setupAgentRuntime({
      fetchImpl: typeof fetch === 'function' ? fetch : undefined,
      network: configOverrides.payments?.network,
    });

    if (runtimeBootstrap) {
      runtime = runtimeBootstrap.runtime;
      const scopesLabel = runtimeBootstrap.scopes?.length
        ? runtimeBootstrap.scopes.join(', ')
        : '(default credential scopes)';
      console.log(
        `[examples] AgentRuntime authenticated via ${runtimeBootstrap.baseUrl} with scopes ${scopesLabel}`
      );
      if (runtimeBootstrap.walletAddress) {
        const chainLabel =
          runtimeBootstrap.chainId !== null
            ? runtimeBootstrap.chainId
            : 'unknown';
        console.log(
          `[examples] Runtime wallet resolved: ${runtimeBootstrap.walletAddress} (chainId ${chainLabel})`
        );
      }
    } else {
      console.warn(
        '[examples] Proceeding without AgentRuntime auth; payments will fall back to unsigned fetch'
      );
    }

    const paidFetchImpl = runtimeBootstrap?.fetchWithPayment ?? fetch;
    const bearerToken = runtimeBootstrap?.accessToken;
    const authHeaders = bearerToken
      ? { authorization: `Bearer ${bearerToken}` }
      : {};

    // Fetch the manifest to confirm trust + payment metadata surfaced correctly.
    const cardResp = await fetch(`${agentOrigin}/.well-known/agent-card.json`, {
      headers: authHeaders,
    });
    const card = await cardResp.json();
    console.log('[examples] AgentCard snapshot:', card);

    const invokeResp = await fetch(`${agentOrigin}/entrypoints/echo/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify({ input: { text: 'hello world' } }),
    });
    console.log('[examples] invoke response:', await invokeResp.json());

    // Minimal SSE consumer to demonstrate streaming output.
    const streamResp = await paidFetchImpl(
      `${agentOrigin}/entrypoints/stream/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ input: { prompt: 'hi' } }),
      }
    );
    console.log('[examples] stream status:', streamResp.status);
    console.log('[examples] stream body:', await streamResp.text());
  } finally {
    await runtime?.shutdown();
  }
}

main().catch(error => {
  console.error('[examples] fatal error', error);
  if (typeof process !== 'undefined') process.exit(1);
});
