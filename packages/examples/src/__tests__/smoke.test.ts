/**
 * Smoke tests for all example modules.
 *
 * Verifies that every example can build agents and boot servers without
 * external dependencies (no blockchain, no wallets, no real APIs).
 * Each test group recreates the agent construction inline rather than
 * importing the example files (which have top-level await / start servers).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  a2a,
  createInMemoryTaskStore,
  createTaskRuntime,
  waitForTask,
} from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { buildServicePageModel, http } from '@lucid-agents/http';
import {
  createServiceUiStyleSheet,
  defineServiceUi,
  resolveServiceUi,
} from '@lucid-agents/http/service-ui';
import {
  bootstrapIdentity,
  type PublicClientLike,
} from '@lucid-agents/identity';
import { evm, mpp, tempo } from '@lucid-agents/mpp';
import { createSQLiteTempoSessionStore } from '@lucid-agents/mpp/storage/sqlite';
import {
  type BatchChannelStorage,
  decodePaymentRequiredHeader,
  payments,
  type X402ReconciliationOptions,
} from '@lucid-agents/payments';
import { createSQLiteBatchChannelStorage } from '@lucid-agents/payments/storage/batch-sqlite';
import type {
  A2ARuntime,
  AgentCardWithEntrypoints,
  TaskStore,
} from '@lucid-agents/types/a2a';
import type { AnalyticsRuntime } from '@lucid-agents/types/analytics';
import { wallets } from '@lucid-agents/wallet';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';
import { evm as evmClient, Mppx as ClientMppx } from 'mppx/client';
import * as Tempo from 'mppx/tempo';
import { createClient, custom, defineChain, type Hex, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to an entrypoint via app.fetch -- no network required */
async function invoke(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  key: string,
  input: Record<string, unknown>
) {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return app.fetch(req);
}

/** POST and assert 200, returning parsed JSON body */
async function invokeOk(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  key: string,
  input: Record<string, unknown>
) {
  const res = await invoke(app, key, input);
  if (!res.ok) {
    throw new Error(`invoke ${key} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { output: Record<string, unknown> };
}

/** Fetch agent card from in-process app */
async function fetchCard(app: {
  fetch: (req: Request) => Response | Promise<Response>;
}): Promise<AgentCardWithEntrypoints> {
  const req = new Request('http://localhost/.well-known/agent-card.json');
  const res = await app.fetch(req);
  if (!res.ok) {
    throw new Error(`agent card failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AgentCardWithEntrypoints;
}

const X402_NETWORK = 'eip155:84532';
const X402_SECOND_NETWORK = 'eip155:8453';
const X402_PAY_TO = '0x1234567890abcdef1234567890abcdef12345678';
const X402_PAYER = '0x9999999999999999999999999999999999999999';
const X402_ASSET = '0x0000000000000000000000000000000000000010';
const X402_SECOND_ASSET = '0x0000000000000000000000000000000000000020';

function encodeX402Payload(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

function decodeX402Payload(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as Record<
    string,
    unknown
  >;
}

type X402Required = {
  x402Version: number;
  resource: unknown;
  accepts: Array<Record<string, unknown>>;
  extensions?: Record<string, unknown>;
};

function decodeX402Required(value: string | null): X402Required {
  const decoded = decodePaymentRequiredHeader(value) as
    | Partial<X402Required>
    | undefined;
  if (
    decoded?.x402Version === undefined ||
    decoded.resource === undefined ||
    !Array.isArray(decoded.accepts)
  ) {
    throw new Error('Expected a complete x402 v2 PAYMENT-REQUIRED header');
  }
  return decoded as X402Required;
}

function x402PaidInvokeRequest(
  key: string,
  input: Record<string, unknown>,
  paymentRequired: {
    x402Version: number;
    resource: unknown;
    accepts: unknown[];
    extensions?: Record<string, unknown>;
  },
  options?: { identifier?: string }
): Request {
  const extensions = structuredClone(paymentRequired.extensions ?? {});
  const accepted = paymentRequired.accepts[0] as { scheme?: string };
  if (options?.identifier) {
    const declaration = extensions['payment-identifier'] as {
      info: Record<string, unknown>;
      schema: unknown;
    };
    extensions['payment-identifier'] = {
      ...declaration,
      info: { ...declaration.info, id: options.identifier },
    };
  }
  return new Request(`http://internal-runtime/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PAYMENT-SIGNATURE': encodeX402Payload({
        x402Version: paymentRequired.x402Version,
        resource: paymentRequired.resource,
        accepted,
        payload:
          accepted.scheme === 'upto'
            ? { permit2Authorization: 'offline-fixture' }
            : { signature: 'offline-fixture' },
        extensions,
      }),
      ...(options?.identifier ? { 'Idempotency-Key': options.identifier } : {}),
    },
    body: JSON.stringify({ input }),
  });
}

type StoredBatchChannel = NonNullable<
  Awaited<ReturnType<BatchChannelStorage['get']>>
>;

function batchChannelFixture(): StoredBatchChannel {
  return {
    channelId: `0x${'ab'.repeat(32)}`,
    channelConfig: {
      payer: `0x${'11'.repeat(20)}`,
      payerAuthorizer: `0x${'22'.repeat(20)}`,
      receiver: `0x${'33'.repeat(20)}`,
      receiverAuthorizer: `0x${'44'.repeat(20)}`,
      token: `0x${'55'.repeat(20)}`,
      withdrawDelay: 900,
      salt: `0x${'66'.repeat(32)}`,
    },
    chargedCumulativeAmount: '7',
    signedMaxClaimable: '7',
    signature: `0x${'77'.repeat(65)}`,
    balance: '100',
    totalClaimed: '0',
    withdrawRequestedAt: 0,
    refundNonce: 0,
    lastRequestTimestamp: 1_000,
    pendingRequest: {
      pendingId: 'pending-offline-smoke',
      signedMaxClaimable: '7',
      expiresAt: 9_000,
    },
  };
}

// ---------------------------------------------------------------------------
// Global env stubs
// ---------------------------------------------------------------------------

describe('Example Smoke Tests', () => {
  beforeAll(() => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      process.env.PAYMENTS_RECEIVABLE_ADDRESS ??
      '0x0000000000000000000000000000000000000001';
    process.env.FACILITATOR_URL =
      process.env.FACILITATOR_URL ?? 'https://facilitator.example.com';
    process.env.NETWORK = process.env.NETWORK ?? 'base-sepolia';
  });

  describe('identity/read-only bootstrap', () => {
    it('discovers and verifies domain identity into trust without a signer', async () => {
      let discoveryRequests = 0;
      const reads: string[] = [];
      const publicClient = {
        async readContract({
          functionName,
        }: Parameters<PublicClientLike['readContract']>[0]) {
          reads.push(functionName);
          if (functionName === 'ownerOf') {
            return '0x000000000000000000000000000000000000002a';
          }
          if (functionName === 'tokenURI') {
            return 'https://known-agent.example/registration.json';
          }
          throw new Error(`Unexpected identity read: ${functionName}`);
        },
      } satisfies PublicClientLike;

      const result = await bootstrapIdentity({
        domain: 'known-agent.example',
        chainId: 84532,
        registryAddress: '0x000000000000000000000000000000000000dEaD',
        publicClient,
        registrationDiscovery: {
          fetch: async () => {
            discoveryRequests += 1;
            return Response.json({
              registrations: [
                {
                  agentId: '42',
                  agentRegistry:
                    'eip155:84532:0x000000000000000000000000000000000000dead',
                },
              ],
            });
          },
        },
      });

      expect(discoveryRequests).toBe(1);
      expect(reads).toEqual(['ownerOf', 'tokenURI']);
      expect(result.record?.agentId).toBe(42n);
      expect(result.signature).toBeUndefined();
      expect(result.trust?.registrations?.[0]).toMatchObject({
        agentId: '42',
        agentRegistry:
          'eip155:84532:0x000000000000000000000000000000000000dead',
      });
    });
  });

  describe('a2a/two-phase durable task admission', () => {
    it('prepares, renews, and activates execution through the public contract', async () => {
      const processStore = createInMemoryTaskStore();
      expect(processStore.durability).toBe('process');

      // The in-memory implementation is relabelled only for this contract
      // smoke; production stores must actually persist every operation.
      const durableContractStore: TaskStore = {
        ...processStore,
        durability: 'durable',
      };
      const tasks = createTaskRuntime({
        store: durableContractStore,
        admissionLeaseMs: 100,
      });
      const taskId = 'two-phase-smoke';
      const accessToken = 'smoke-access-token-0001';

      await tasks.reserve({
        taskId,
        accessToken,
        admissionTtlMs: 1_000,
      });
      const prepared = await tasks.prepare(taskId);
      await prepared.renew();
      await prepared.activate({
        execute: async () => ({ output: { admitted: true } }),
      });

      let settled = await tasks.get(taskId, accessToken);
      for (
        let attempt = 0;
        settled?.status === 'running' && attempt < 20;
        attempt++
      ) {
        await new Promise(resolve => setTimeout(resolve, 1));
        settled = await tasks.get(taskId, accessToken);
      }
      expect(settled).toMatchObject({
        taskId,
        status: 'completed',
        result: { output: { admitted: true } },
      });
      await tasks.close();
    });
  });

  describe('payments/x402 2.19 offline integration', () => {
    it('projects and serves multi-offer discovery with official extensions', async () => {
      const originalFetch = globalThis.fetch;
      const issuer: NonNullable<
        X402ReconciliationOptions['offerReceipt']
      >['issuer'] = {
        kid: 'did:web:offline.example#payments',
        format: 'jws',
        issueOffer: async () => ({
          format: 'jws',
          signature: 'offline.offer.signature',
        }),
        issueReceipt: async () => ({
          format: 'jws',
          signature: 'offline.receipt.signature',
        }),
      };
      globalThis.fetch = (async (input, init) => {
        const url = new URL(new Request(input, init).url);
        const second = url.hostname === 'facilitator-two.example';
        if (url.pathname.endsWith('/supported')) {
          return Response.json({
            kinds: [
              {
                x402Version: 2,
                scheme: 'exact',
                network: second ? X402_SECOND_NETWORK : X402_NETWORK,
                asset: {
                  address: second ? X402_SECOND_ASSET : X402_ASSET,
                  decimals: 6,
                },
                extra: {},
              },
            ],
            extensions: [],
            signers: {},
          });
        }
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      }) as typeof globalThis.fetch;

      try {
        const agent = await createAgent({
          name: 'x402-discovery-smoke',
          version: '1.0.0',
        })
          .use(http())
          .use(
            payments({
              config: {
                payTo: X402_PAY_TO,
                network: X402_NETWORK,
                facilitatorUrl: 'https://facilitator-one.example',
                siwx: {
                  enabled: true,
                  origin: 'https://public.agent.example',
                  verify: { skipSignatureVerification: true },
                },
              },
              reconciliation: {
                paymentIdentifier: { required: true },
                bazaar: { enabled: true },
                offerReceipt: {
                  issuer,
                  includeTxHash: false,
                  offerValiditySeconds: 60,
                },
              },
            })
          )
          .build();
        const agentApp = await createAgentApp(agent);
        agentApp.addEntrypoint({
          key: 'quote',
          description: 'Return an offline quote',
          paymentProtocol: 'x402',
          x402: {
            offers: [
              {
                scheme: 'exact',
                network: X402_NETWORK,
                facilitatorUrl: 'https://facilitator-one.example',
                price: { amount: '1000', asset: X402_ASSET },
              },
              {
                scheme: 'exact',
                network: X402_SECOND_NETWORK,
                facilitatorUrl: 'https://facilitator-two.example',
                price: { amount: '2000', asset: X402_SECOND_ASSET },
              },
            ],
          },
          input: z.object({ symbol: z.string() }),
          output: z.object({ price: z.number() }),
          handler: async () => ({ output: { price: 42 } }),
        });
        agentApp.addEntrypoint({
          key: 'profile',
          siwx: {
            authOnly: true,
            statement: 'Sign in to the offline profile',
          },
          handler: async () => ({ output: { ok: true } }),
        });

        const card = await fetchCard(agentApp.app);
        expect(card.payments?.map(payment => payment.extensions?.x402)).toEqual(
          [
            {
              scheme: 'exact',
              network: X402_NETWORK,
              facilitatorUrl: 'https://facilitator-one.example',
              payTo: X402_PAY_TO,
              price: { amount: '1000', asset: X402_ASSET },
            },
            {
              scheme: 'exact',
              network: X402_SECOND_NETWORK,
              facilitatorUrl: 'https://facilitator-two.example',
              payTo: X402_PAY_TO,
              price: { amount: '2000', asset: X402_SECOND_ASSET },
            },
          ]
        );

        const openApiResponse = await agentApp.app.fetch(
          new Request('http://internal-runtime/openapi.json')
        );
        const openApi = (await openApiResponse.json()) as {
          paths: Record<
            string,
            {
              post: {
                'x-x402-payment': {
                  offers: unknown[];
                  extensions: Record<string, unknown>;
                };
              };
            }
          >;
        };
        const projected =
          openApi.paths['/entrypoints/quote/invoke']!.post['x-x402-payment'];
        expect(projected.offers).toHaveLength(2);
        expect(projected.extensions.bazaar).toBeDefined();
        expect(projected.extensions['payment-identifier']).toBeDefined();
        expect(projected.extensions['offer-receipt']).toEqual({
          includeTxHash: false,
          offerValiditySeconds: 60,
        });
        expect(JSON.stringify(projected)).not.toContain('issueOffer');

        const challenge = await agentApp.app.fetch(
          new Request('http://internal-runtime/entrypoints/quote/invoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { symbol: 'ETH' } }),
          })
        );
        const required = decodeX402Required(
          challenge.headers.get('PAYMENT-REQUIRED')
        );
        expect(required.accepts.map(offer => offer.network)).toEqual([
          X402_NETWORK,
          X402_SECOND_NETWORK,
        ]);
        expect(
          (
            required.extensions?.['offer-receipt'] as {
              info: { offers: Array<{ signature: string }> };
            }
          ).info.offers.map(offer => offer.signature)
        ).toEqual(['offline.offer.signature', 'offline.offer.signature']);

        const siwxChallenge = await agentApp.app.fetch(
          new Request(
            'http://internal-runtime/entrypoints/profile/invoke?view=full',
            {
              method: 'POST',
              headers: {
                Host: 'attacker.example',
                Forwarded: 'host=attacker.example;proto=https',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ input: {} }),
            }
          )
        );
        const siwxRequired = decodeX402Required(
          siwxChallenge.headers.get('PAYMENT-REQUIRED')
        );
        const siwx = siwxRequired.extensions?.['sign-in-with-x'] as {
          info: { domain: string; uri: string };
        };
        expect(siwxChallenge.status).toBe(401);
        expect(siwxChallenge.headers.has('X-SIWX-EXTENSION')).toBe(false);
        expect(siwx.info).toMatchObject({
          domain: 'public.agent.example',
          uri: 'https://public.agent.example/entrypoints/profile/invoke?view=full',
        });
        await agent.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('replays an identified payment without executing or settling twice', async () => {
      const originalFetch = globalThis.fetch;
      let executions = 0;
      let settlements = 0;
      const issuer: NonNullable<
        X402ReconciliationOptions['offerReceipt']
      >['issuer'] = {
        kid: 'did:web:offline.example#payments',
        format: 'jws',
        issueOffer: async () => ({
          format: 'jws',
          signature: 'offline.offer.signature',
        }),
        issueReceipt: async () => ({
          format: 'jws',
          signature: 'offline.receipt.signature',
        }),
      };
      globalThis.fetch = (async (input, init) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        if (path.endsWith('/supported')) {
          return Response.json({
            kinds: [
              {
                x402Version: 2,
                scheme: 'exact',
                network: X402_NETWORK,
                asset: { address: X402_ASSET, decimals: 6 },
                extra: {},
              },
            ],
            extensions: [],
            signers: {},
          });
        }
        if (path.endsWith('/verify')) {
          return Response.json({ isValid: true, payer: X402_PAYER });
        }
        if (path.endsWith('/settle')) {
          settlements += 1;
          return Response.json({
            success: true,
            payer: X402_PAYER,
            network: X402_NETWORK,
            transaction: `0x${'12'.repeat(32)}`,
          });
        }
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      }) as typeof globalThis.fetch;

      try {
        const agent = await createAgent({
          name: 'x402-replay-smoke',
          version: '1.0.0',
        })
          .use(http())
          .use(
            payments({
              config: {
                payTo: X402_PAY_TO,
                network: X402_NETWORK,
                facilitatorUrl: 'https://facilitator-one.example',
              },
              reconciliation: {
                paymentIdentifier: { required: true },
                offerReceipt: { issuer },
              },
            })
          )
          .build();
        const agentApp = await createAgentApp(agent);
        agentApp.addEntrypoint({
          key: 'identified',
          paymentProtocol: 'x402',
          x402: {
            offers: [
              {
                scheme: 'exact',
                network: X402_NETWORK,
                price: { amount: '1000', asset: X402_ASSET },
              },
            ],
          },
          input: z.object({ value: z.string() }),
          output: z.object({ value: z.string() }),
          handler: async ctx => {
            executions += 1;
            return { output: { value: ctx.input.value } };
          },
        });
        const unpaid = await agentApp.app.fetch(
          new Request('http://internal-runtime/entrypoints/identified/invoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { value: 'once' } }),
          })
        );
        const required = decodeX402Required(
          unpaid.headers.get('PAYMENT-REQUIRED')
        );
        const identifier = 'pay_offline_replay_0001';
        const paidRequest = () =>
          x402PaidInvokeRequest('identified', { value: 'once' }, required, {
            identifier,
          });

        const first = await agentApp.app.fetch(paidRequest());
        const replay = await agentApp.app.fetch(paidRequest());
        expect(first.status).toBe(200);
        expect(await first.clone().json()).toMatchObject({
          output: { value: 'once' },
        });
        expect(replay.status).toBe(200);
        expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
        expect(executions).toBe(1);
        expect(settlements).toBe(1);
        const paymentResponse = decodeX402Payload(
          replay.headers.get('PAYMENT-RESPONSE')!
        ) as {
          extensions: {
            'offer-receipt': {
              info: { receipt: { signature: string } };
            };
          };
        };
        expect(
          paymentResponse.extensions['offer-receipt'].info.receipt.signature
        ).toBe('offline.receipt.signature');
        await agent.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('settles the handler-reported upto usage through the HTTP runtime', async () => {
      const originalFetch = globalThis.fetch;
      const settledAmounts: string[] = [];
      globalThis.fetch = (async (input, init) => {
        const request = new Request(input, init);
        const path = new URL(request.url).pathname;
        if (path.endsWith('/supported')) {
          return Response.json({
            kinds: [
              {
                x402Version: 2,
                scheme: 'upto',
                network: X402_NETWORK,
                asset: {
                  address: X402_ASSET,
                  decimals: 6,
                  eip712: { name: 'USDC', version: '2' },
                },
                extra: {
                  assetTransferMethod: 'permit2',
                  facilitatorAddress:
                    '0x0000000000000000000000000000000000000001',
                },
              },
            ],
            extensions: [],
            signers: {},
          });
        }
        if (path.endsWith('/verify')) {
          return Response.json({ isValid: true, payer: X402_PAYER });
        }
        if (path.endsWith('/settle')) {
          const body = (await request.json()) as {
            paymentRequirements: { amount: string };
          };
          settledAmounts.push(body.paymentRequirements.amount);
          return Response.json({
            success: true,
            payer: X402_PAYER,
            network: X402_NETWORK,
            transaction: `0x${'34'.repeat(32)}`,
            amount: body.paymentRequirements.amount,
          });
        }
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      }) as typeof globalThis.fetch;

      try {
        const agent = await createAgent({
          name: 'x402-upto-smoke',
          version: '1.0.0',
        })
          .use(http())
          .use(
            payments({
              config: {
                payTo: X402_PAY_TO,
                network: X402_NETWORK,
                facilitatorUrl: 'https://facilitator-one.example',
              },
            })
          )
          .build();
        const agentApp = await createAgentApp(agent);
        agentApp.addEntrypoint({
          key: 'metered',
          paymentProtocol: 'x402',
          x402: {
            offers: [
              {
                scheme: 'upto',
                network: X402_NETWORK,
                maximum: { amount: '1000', asset: X402_ASSET },
              },
            ],
          },
          input: z.object({ units: z.number().int().nonnegative() }),
          output: z.object({ acceptedUnits: z.number() }),
          handler: async ctx => ({
            output: { acceptedUnits: ctx.input.units },
            payment: {
              actualAmount: String(ctx.input.units * 50),
              asset: X402_ASSET,
            },
          }),
        });
        const card = await fetchCard(agentApp.app);
        expect(card.entrypoints.metered?.pricing?.invoke).toBe('1000');
        expect(card.payments?.[0]?.extensions?.x402).toEqual({
          scheme: 'upto',
          network: X402_NETWORK,
          facilitatorUrl: 'https://facilitator-one.example',
          payTo: X402_PAY_TO,
          maximum: { amount: '1000', asset: X402_ASSET },
        });
        const unpaid = await agentApp.app.fetch(
          new Request('http://internal-runtime/entrypoints/metered/invoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { units: 5 } }),
          })
        );
        const required = decodeX402Required(
          unpaid.headers.get('PAYMENT-REQUIRED')
        );
        const paid = await agentApp.app.fetch(
          x402PaidInvokeRequest('metered', { units: 5 }, required)
        );

        if (paid.status !== 200) {
          throw new Error(
            `upto invoke failed: ${paid.status} ${await paid.clone().text()}`
          );
        }
        expect(paid.status).toBe(200);
        expect(settledAmounts).toEqual(['250']);
        await agent.close();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('recovers pending batch channel state after a SQLite restart', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'lucid-x402-smoke-'));
      const dbPath = join(directory, 'channels.db');
      const fixture = batchChannelFixture();
      try {
        const first = createSQLiteBatchChannelStorage(dbPath, {
          namespace: 'offline-smoke',
        });
        await first.updateChannel(fixture.channelId, () => fixture);
        first.close();

        const restarted = createSQLiteBatchChannelStorage(dbPath, {
          namespace: 'offline-smoke',
        });
        expect(
          (await restarted.get(fixture.channelId))?.pendingRequest
        ).toEqual(fixture.pendingRequest);
        restarted.close();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe('http/configurable service storefront', () => {
    it('serves the typed preset as a minimal endpoint directory', async () => {
      const servicePage = defineServiceUi({ preset: 'folio' });
      const resolved = resolveServiceUi(servicePage);
      expect(resolved.preset).toBe('folio');
      expect(createServiceUiStyleSheet(resolved)).toContain(
        '[data-service-ui-preset="folio"]'
      );

      const agent = await createAgent({
        name: 'storefront-smoke',
        version: '1.0.0',
        description: 'Typed configurable storefront smoke test',
      })
        .use(http({ servicePage }))
        .build();
      const agentApp = await createAgentApp(agent);
      agentApp.addEntrypoint({
        key: 'inspect',
        description: 'Inspect a public payload',
        input: z.object({ value: z.string() }),
        output: z.object({ value: z.string() }),
        handler: async ctx => ({ output: { value: ctx.input.value } }),
      });

      const response = await agentApp.app.fetch(
        new Request('http://localhost/')
      );
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain('data-service-ui-preset="folio"');
      expect(html).toContain('data-service-ui-mode="directory"');
      expect(html).toContain('Typed configurable storefront smoke test');
      expect(html).toContain('Inspect a public payload');
      expect(html).toContain('class="endpoint-table"');
      expect(html).toContain('/entrypoints/inspect/invoke');
      expect(html).toContain('Payment method');
      expect(html).toContain('Free');
      expect(html).not.toContain('Public Agent Card JSON');
      expect(html).not.toContain('Input schema');
      expect(html).not.toContain('<pre');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('data-action=');
    });
  });

  // =========================================================================
  // 1. core/full-agent
  // =========================================================================
  describe('core/full-agent', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'full-agent-example',
        version: '1.0.0',
        description: 'Smoke test for full-agent example',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x0000000000000000000000000000000000000001',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.example.com',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'echo',
        description: 'Echo back the input text',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => ({
          output: { text: ctx.input.text },
          usage: { total_tokens: ctx.input.text.length },
        }),
      });

      app = agentApp.app;
    });

    it('agent card is valid JSON', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('full-agent-example');
      expect(card.version).toBe('1.0.0');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('echo entrypoint returns correct shape', async () => {
      const result = await invokeOk(app, 'echo', { text: 'hello' });
      expect(result.output.text).toBe('hello');
    });
  });

  // =========================================================================
  // 2. payments/paid-service
  // =========================================================================
  describe('payments/paid-service', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'paid-service',
        version: '1.0.0',
        description: 'Service agent with paid entrypoints',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.daydreams.systems',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'echo',
        description: 'Echo back your message',
        price: '1.0',
        input: z.object({ message: z.string() }),
        output: z.object({ message: z.string(), timestamp: z.string() }),
        handler: async (ctx: { input: { message: string } }) => ({
          output: {
            message: ctx.input.message,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      agentApp.addEntrypoint({
        key: 'process',
        description: 'Process an item',
        price: '5.0',
        input: z.object({ item: z.string() }),
        output: z.object({ result: z.string(), processed: z.boolean() }),
        handler: async (ctx: { input: { item: string } }) => ({
          output: {
            result: `Processed: ${ctx.input.item}`,
            processed: true,
          },
        }),
      });

      app = agentApp.app;
    });

    it('agent card has payment info', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('paid-service');
      expect(Array.isArray(card.skills)).toBe(true);

      const service = buildServicePageModel(card, {
        health: { ok: true, status: 'healthy' },
        baseUrl: 'http://localhost',
      });
      expect(service.status.state).toBe('online');
      expect(service.offerings).toHaveLength(2);
      expect(service.offerings[0]?.payment).toMatchObject({
        required: true,
        protocol: 'x402',
        network: 'eip155:84532',
      });
      expect(service.offerings[0]?.operations.invoke.url).toBe(
        'http://localhost/entrypoints/echo/invoke'
      );
    });

    it('echo entrypoint returns 402 without payment header', async () => {
      const res = await invoke(app, 'echo', { message: 'hello' });
      expect(res.status).toBe(402);
    });

    it('process entrypoint returns 402 without payment header', async () => {
      const res = await invoke(app, 'process', { item: 'test' });
      expect(res.status).toBe(402);
    });
  });

  // =========================================================================
  // 3. a2a/full-integration (three-agent composition)
  // =========================================================================
  describe('a2a/full-integration', () => {
    const WORKER_PORT = 19010;
    const FACILITATOR_PORT = 19011;

    let workerServer: ReturnType<typeof Bun.serve>;
    let facilitatorServer: ReturnType<typeof Bun.serve>;
    let clientA2A: A2ARuntime;

    beforeAll(async () => {
      // Agent 1: Worker
      const workerAgent = await createAgent({
        name: 'worker-agent',
        version: '1.0.0',
        description: 'Worker agent that processes tasks',
      })
        .use(http())
        .use(a2a())
        .build();

      const { app: workerApp, addEntrypoint: addWorkerEp } =
        await createAgentApp(workerAgent);

      addWorkerEp({
        key: 'echo',
        description: 'Echoes back the input text',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => ({
          output: { text: `Echo: ${ctx.input.text}` },
          usage: { total_tokens: ctx.input.text.length },
        }),
      });

      addWorkerEp({
        key: 'process',
        description: 'Processes data and returns result',
        input: z.object({ data: z.array(z.number()) }),
        output: z.object({ result: z.number() }),
        handler: async (ctx: { input: { data: number[] } }) => {
          const result = ctx.input.data.reduce(
            (sum: number, n: number) => sum + n,
            0
          );
          return {
            output: { result },
            usage: { total_tokens: ctx.input.data.length },
          };
        },
      });

      workerServer = Bun.serve({
        port: WORKER_PORT,
        fetch: workerApp.fetch.bind(workerApp),
      });

      // Agent 2: Facilitator
      const facilitatorAgent = await createAgent({
        name: 'facilitator-agent',
        version: '1.0.0',
        description: 'Facilitator agent that proxies to worker',
      })
        .use(http())
        .use(a2a())
        .build();

      const {
        app: facilitatorApp,
        addEntrypoint: addFacilitatorEp,
        runtime: facilitatorRuntime,
      } = await createAgentApp(facilitatorAgent);

      const facilitatorA2A = facilitatorRuntime.a2a!;

      addFacilitatorEp({
        key: 'echo',
        description: 'Proxies echo requests to worker agent',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => {
          const workerCard = await facilitatorA2A.fetchCard(
            `http://localhost:${WORKER_PORT}`
          );
          const taskAccess = await facilitatorA2A.client.sendMessage(
            workerCard,
            'echo',
            { text: ctx.input.text }
          );
          const task = await waitForTask<{ text: string }>(
            facilitatorA2A.client,
            workerCard,
            taskAccess
          );
          if (task.status === 'failed') {
            throw new Error(
              `Task failed: ${task.error?.message || 'Unknown error'}`
            );
          }
          return {
            output: task.result!.output!,
            usage: task.result?.usage,
          };
        },
      });

      facilitatorServer = Bun.serve({
        port: FACILITATOR_PORT,
        fetch: facilitatorApp.fetch.bind(facilitatorApp),
      });

      // Agent 3: Client (no server needed)
      const clientAgent = await createAgent({
        name: 'client-agent',
        version: '1.0.0',
        description: 'Client agent that calls facilitator',
      })
        .use(a2a())
        .build();

      clientA2A = clientAgent.a2a!;

      // Give servers time to be ready
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    afterAll(() => {
      workerServer?.stop();
      facilitatorServer?.stop();
    });

    it('worker agent card is discoverable', async () => {
      const res = await fetch(
        `http://localhost:${WORKER_PORT}/.well-known/agent-card.json`
      );
      expect(res.ok).toBe(true);
      const card = (await res.json()) as { name: string; skills: unknown[] };
      expect(card.name).toBe('worker-agent');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('facilitator agent card is discoverable', async () => {
      const res = await fetch(
        `http://localhost:${FACILITATOR_PORT}/.well-known/agent-card.json`
      );
      expect(res.ok).toBe(true);
      const card = (await res.json()) as { name: string; skills: unknown[] };
      expect(card.name).toBe('facilitator-agent');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('client calls worker via facilitator (echo)', async () => {
      const facilitatorCard = await clientA2A.fetchCard(
        `http://localhost:${FACILITATOR_PORT}`
      );
      expect(facilitatorCard.name).toBe('facilitator-agent');

      const taskAccess = await clientA2A.client.sendMessage(
        facilitatorCard,
        'echo',
        { text: 'hello from client' }
      );

      const task = await waitForTask(
        clientA2A.client,
        facilitatorCard,
        taskAccess
      );
      expect(task.status).toBe('completed');
      const output = task.result?.output as { text: string } | undefined;
      expect(output?.text).toBe('Echo: hello from client');
    });
  });

  // =========================================================================
  // 4. analytics
  // =========================================================================
  describe('analytics', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'analytics-agent',
        version: '1.0.0',
        description: 'Agent demonstrating payment analytics',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x0000000000000000000000000000000000000001',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.example.com',
            },
          })
        )
        .use(analytics())
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'summary',
        description: 'Get payment summary statistics',
        input: z.object({
          windowHours: z.number().optional().default(24),
        }),
        output: z.object({
          summary: z.object({
            outgoingTotal: z.string(),
            incomingTotal: z.string(),
            netTotal: z.string(),
            outgoingCount: z.number(),
            incomingCount: z.number(),
          }),
        }),
        async handler({
          input,
          runtime,
        }: {
          input: { windowHours: number };
          runtime: { analytics?: AnalyticsRuntime };
        }) {
          if (!runtime?.analytics) {
            return {
              output: {
                summary: {
                  outgoingTotal: '0',
                  incomingTotal: '0',
                  netTotal: '0',
                  outgoingCount: 0,
                  incomingCount: 0,
                },
              },
            };
          }

          const windowMs = input.windowHours * 60 * 60 * 1000;
          const summary = await runtime.analytics.getSummary(windowMs);

          return {
            output: {
              summary: {
                outgoingTotal: summary.outgoingTotal.toString(),
                incomingTotal: summary.incomingTotal.toString(),
                netTotal: summary.netTotal.toString(),
                outgoingCount: summary.outgoingCount,
                incomingCount: summary.incomingCount,
              },
            },
          };
        },
      });

      app = agentApp.app;
    });

    it('agent card is valid', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('analytics-agent');
    });

    it('summary entrypoint returns expected fields', async () => {
      const result = await invokeOk(app, 'summary', {});
      const summary = result.output.summary as Record<string, unknown>;
      expect(typeof summary.outgoingTotal).toBe('string');
      expect(typeof summary.incomingTotal).toBe('string');
      expect(typeof summary.netTotal).toBe('string');
      expect(typeof summary.outgoingCount).toBe('number');
      expect(typeof summary.incomingCount).toBe('number');
    });
  });

  // =========================================================================
  // 5. mpp/mpp-paid-service
  // =========================================================================
  describe('mpp/mpp-paid-service', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'mpp-paid-service',
        version: '1.0.0',
        description: 'Paid service agent using MPP',
      })
        .use(http())
        .use(
          mpp({
            allowInsecureHttpForDevelopment: true,
            config: {
              methods: [
                tempo.server({
                  currency: '0x20c0000000000000000000000000000000000000',
                  recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                }),
              ],
              currency: 'usd',
              defaultIntent: 'charge',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'health',
        description: 'Health check (free)',
        input: z.object({}),
        output: z.object({
          status: z.string(),
          timestamp: z.string(),
        }),
        handler: async () => ({
          output: {
            status: 'ok',
            timestamp: new Date().toISOString(),
          },
        }),
      });

      agentApp.addEntrypoint({
        key: 'summarize',
        description: 'Summarize text (paid)',
        price: '0.01',
        input: z.object({ text: z.string() }),
        output: z.object({
          wordCount: z.number(),
          charCount: z.number(),
          preview: z.string(),
        }),
        handler: async ({ input }: { input: { text: string } }) => {
          const words = input.text.trim().split(/\s+/).filter(Boolean);
          const preview =
            input.text.length > 100
              ? `${input.text.slice(0, 100)}...`
              : input.text;
          return {
            output: {
              wordCount: words.length,
              charCount: input.text.length,
              preview,
            },
          };
        },
      });

      app = agentApp.app;
    });

    it('agent card is valid', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('mpp-paid-service');
    });

    it('free health entrypoint returns correct shape', async () => {
      const result = await invokeOk(app, 'health', {});
      expect(result.output.status).toBe('ok');
      expect(typeof result.output.timestamp).toBe('string');
    });

    it('paid summarize entrypoint returns 402 without payment', async () => {
      const res = await invoke(app, 'summarize', { text: 'hello world' });
      expect(res.status).toBe(402);
    });
  });

  describe('mpp/native-tempo-session-service', () => {
    it('authorizes invoke and meters SSE through a restarted durable Tempo session', async () => {
      const payer = privateKeyToAccount(
        '0xac0974bec39a17e36ba6a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const payee = privateKeyToAccount(
        '0x59c6995e998f97a5a0044966f094538a009d74290f5811cfba6a6b4d238ff944'
      );
      const chainId = 42431;
      const token = '0x20c0000000000000000000000000000000000000' as const;
      const chain = defineChain({
        id: chainId,
        name: 'Tempo Test',
        nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
        rpcUrls: { default: { http: ['http://localhost'] } },
      });
      const payerClient = createClient({
        account: payer,
        chain,
        transport: custom({
          async request() {
            throw new Error('Tempo session payer fixture does not call RPC');
          },
        }),
      });
      const serverClient = createClient({
        account: payee,
        chain,
        transport: custom({
          async request() {
            throw new Error('Tempo session server fixture does not call RPC');
          },
        }),
      });
      const descriptor = {
        payer: payer.address,
        payee: payee.address,
        operator: zeroAddress,
        token,
        salt: `0x${'11'.repeat(32)}` as Hex,
        authorizedSigner: payer.address,
        expiringNonceHash: `0x${'22'.repeat(32)}` as Hex,
      };
      const escrow = Tempo.Session.Precompile.Constants.tip20ChannelEscrow;
      const channelId = Tempo.Session.Precompile.Channel.computeId({
        ...descriptor,
        chainId,
        escrow,
      });
      const signature = await Tempo.Session.Precompile.Voucher.signVoucher(
        payerClient,
        payer,
        { channelId, cumulativeAmount: 5n },
        escrow,
        chainId
      );
      const directory = mkdtempSync(join(tmpdir(), 'lucid-tempo-smoke-'));
      const dbPath = join(directory, 'sessions.db');
      const firstStore = createSQLiteTempoSessionStore(dbPath, {
        namespace: 'offline-smoke',
      });
      await firstStore.put(channelId, {
        backend: 'precompile',
        channelId,
        chainId,
        escrowContract: escrow,
        closeRequestedAt: 0n,
        payer: payer.address,
        payee: payee.address,
        token,
        authorizedSigner: payer.address,
        deposit: 5n,
        settledOnChain: 0n,
        highestVoucherAmount: 5n,
        highestVoucher: {
          channelId,
          cumulativeAmount: 5n,
          signature,
        },
        spent: 0n,
        units: 0,
        finalized: false,
        createdAt: new Date().toISOString(),
        descriptor,
        operator: descriptor.operator,
        salt: descriptor.salt,
        expiringNonceHash: descriptor.expiringNonceHash,
      });
      firstStore.close();

      const store = createSQLiteTempoSessionStore(dbPath, {
        namespace: 'offline-smoke',
      });
      expect(await store.get(channelId)).toMatchObject({
        spent: 0n,
        units: 0,
      });
      let closeAgent: (() => Promise<void>) | undefined;
      try {
        const agent = await createAgent({
          name: 'mpp-tempo-session',
          version: '1.0.0',
        })
          .use(http())
          .use(
            mpp({
              allowInsecureHttpForDevelopment: true,
              config: {
                methods: [
                  tempo.session({
                    mode: 'production',
                    account: payee,
                    chainId,
                    currency: token,
                    recipient: payee.address,
                    decimals: 0,
                    amount: '1',
                    unitType: 'chunk',
                    deposit: {
                      minimum: '1',
                      suggested: '5',
                      maximum: '5',
                    },
                    store,
                    getClient: () => serverClient,
                    channelStateTtlMs: Number.MAX_SAFE_INTEGER,
                  }),
                ],
                defaultIntent: 'session',
                secretKey: 'tempo-session-smoke-secret-key-32-bytes',
              },
            })
          )
          .build();
        closeAgent = () => agent.close();
        const agentApp = await createAgentApp(agent);
        let invocations = 0;
        agentApp.addEntrypoint({
          key: 'session-report',
          price: { invoke: '99', stream: '99' },
          paymentProtocol: 'mpp',
          metadata: { mpp: { intent: 'session' } },
          input: z.object({}),
          output: z.object({ ok: z.boolean() }),
          handler: async () => {
            invocations += 1;
            return { output: { ok: true } };
          },
          stream: async (_context, emit) => {
            await emit({ kind: 'text', text: 'one' });
            await emit({ kind: 'text', text: 'two' });
            return { status: 'succeeded', output: { ok: true } };
          },
        });

        const card = await fetchCard(agentApp.app);
        expect(card.entrypoints['session-report']?.pricing).toEqual({
          invoke: '1',
          stream: '1',
        });
        expect(card.payments).toHaveLength(1);
        expect(card.payments?.[0]).toMatchObject({
          method: 'mpp',
          network: 'mpp',
          priceModel: { default: '1' },
          extensions: {
            mpp: {
              amount: '1',
              currency: token,
              intent: 'session',
              method: 'tempo',
            },
          },
        });

        const body = JSON.stringify({ input: {} });
        const credentialFor = (challenge: Challenge.Challenge) =>
          Credential.serialize({
            challenge,
            source: `did:pkh:eip155:${chainId}:${payer.address}`,
            payload: {
              action: 'voucher',
              channelId,
              descriptor,
              cumulativeAmount: '5',
              signature,
            },
          });
        const sessionRequest = (
          operation: 'invoke' | 'stream',
          authorization?: string
        ) =>
          new Request(
            `http://localhost/entrypoints/session-report/${operation}`,
            {
              method: 'POST',
              headers: {
                Accept:
                  operation === 'stream'
                    ? 'text/event-stream'
                    : 'application/json',
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: authorization } : {}),
              },
              body,
            }
          );

        const invokeChallenge = await agentApp.app.fetch(
          sessionRequest('invoke')
        );
        expect(invokeChallenge.status).toBe(402);
        const invoked = await agentApp.app.fetch(
          sessionRequest(
            'invoke',
            credentialFor(Challenge.fromResponse(invokeChallenge))
          )
        );
        expect(invoked.status).toBe(200);
        expect(invoked.headers.get('Payment-Receipt')).toBeTruthy();
        expect(await invoked.json()).toMatchObject({ output: { ok: true } });
        expect(invocations).toBe(1);

        const streamChallenge = await agentApp.app.fetch(
          sessionRequest('stream')
        );
        expect(streamChallenge.status).toBe(402);
        const streamed = await agentApp.app.fetch(
          sessionRequest(
            'stream',
            credentialFor(Challenge.fromResponse(streamChallenge))
          )
        );
        expect(streamed.status).toBe(200);
        expect(streamed.headers.get('Payment-Receipt')).toBeTruthy();
        const events = await streamed.text();
        expect(events).toContain('event: payment-receipt');
        expect(events).toContain('"deliveredUnits":2');
        expect(events).toContain('"actualAmount":"2"');
        expect(events).toContain('"text":"one"');
        expect(events).toContain('"text":"two"');
        expect(await store.get(channelId)).toMatchObject({
          spent: 3n,
          units: 3,
        });

        await agent.close();
        closeAgent = undefined;
        const restarted = createSQLiteTempoSessionStore(dbPath, {
          namespace: 'offline-smoke',
        });
        expect(await restarted.get(channelId)).toMatchObject({
          spent: 3n,
          units: 3,
        });
        restarted.close();
      } finally {
        await closeAgent?.();
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });

  describe('mpp/native-evm-x402-service', () => {
    it('settles one x402 exact retry before invoking the handler', async () => {
      const account = privateKeyToAccount(
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );
      const currency = '0x0000000000000000000000000000000000000001';
      let settlements = 0;
      let invocations = 0;
      const agent = await createAgent({
        name: 'mpp-evm-service',
        version: '1.0.0',
      })
        .use(http())
        .use(
          mpp({
            allowInsecureHttpForDevelopment: true,
            config: {
              methods: [
                evm.server({
                  chainId: 84532,
                  currency,
                  recipient: '0x0000000000000000000000000000000000000002',
                  decimals: 6,
                  authorization: { name: 'USD Coin', version: '2' },
                  settlement: {
                    type: 'custom',
                    async settle() {
                      settlements += 1;
                      return { reference: '0xsmoke' };
                    },
                  },
                }),
              ],
              secretKey: 'mpp-evm-smoke-secret-key-with-32-bytes',
            },
          })
        )
        .build();
      const agentApp = await createAgentApp(agent);
      agentApp.addEntrypoint({
        key: 'paid-evm',
        price: '0.01',
        input: z.object({ prompt: z.string() }),
        output: z.object({ ok: z.boolean() }),
        handler: async () => {
          invocations += 1;
          return { output: { ok: true } };
        },
      });
      const requestBody = JSON.stringify({
        input: { prompt: 'paid request' },
      });
      const request = (paymentSignature?: string) =>
        new Request('http://localhost/entrypoints/paid-evm/invoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(paymentSignature
              ? { 'PAYMENT-SIGNATURE': paymentSignature }
              : {}),
          },
          body: requestBody,
        });

      const challenged = await agentApp.app.fetch(request());
      expect(challenged.status).toBe(402);
      const paymentRequired = challenged.headers.get('PAYMENT-REQUIRED');
      expect(paymentRequired).toBeTruthy();
      const client = ClientMppx.create({
        methods: [
          evmClient.charge({
            account,
            authorization: { name: 'USD Coin', version: '2' },
            decimals: 6,
            networks: [84532],
            currencies: [currency],
          }),
        ],
        polyfill: false,
      });
      const paymentSignature = await client.createCredential(
        new Response(null, {
          status: 402,
          headers: { 'PAYMENT-REQUIRED': paymentRequired! },
        })
      );

      const accepted = await agentApp.app.fetch(request(paymentSignature));
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get('Payment-Receipt')).toBeTruthy();
      expect(accepted.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
      expect(settlements).toBe(1);
      expect(invocations).toBe(1);

      const replay = await agentApp.app.fetch(request(paymentSignature));
      expect(replay.status).toBe(402);
      expect(settlements).toBe(1);
      expect(invocations).toBe(1);
    });
  });

  // =========================================================================
  // 6. payments/policy-agent
  // =========================================================================
  describe('payments/policy-agent', () => {
    it('builds without error and produces valid agent card', async () => {
      const agent = await createAgent({
        name: 'policy-agent',
        version: '1.0.0',
        description: 'Agent demonstrating payment policy enforcement',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x1234567890123456789012345678901234567890',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.daydreams.systems',
            },
          })
        )
        .use(
          wallets({
            config: {
              agent: {
                type: 'local',
                privateKey:
                  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
              },
            },
          })
        )
        .build();

      expect(agent).toBeDefined();
      expect(agent.payments).toBeDefined();
      expect(agent.wallets).toBeDefined();

      const agentApp = await createAgentApp(agent);
      const card = await fetchCard(agentApp.app);
      expect(card.name).toBe('policy-agent');
      expect(card.version).toBe('1.0.0');
    });
  });
});
