import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http as lucidHttp } from '@lucid-agents/http';
import { mpp, tempo as tempoServer } from '@lucid-agents/mpp';
import { createSQLiteTempoSessionStore } from '@lucid-agents/mpp/storage/sqlite';
import { createInMemoryPaymentStorage, payments } from '@lucid-agents/payments';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Receipt } from 'mppx';
import { Mppx as ClientMppx, tempo as tempoClient } from 'mppx/client';
import * as Tempo from 'mppx/tempo';
import {
  type Client,
  createClient,
  defineChain,
  http,
  parseEventLogs,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
  getBlockNumber,
  getChainId,
  getLogs,
  sendTransactionSync,
} from 'viem/actions';
import { Actions, Addresses } from 'viem/tempo';
import { z } from 'zod';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const EXPECTED_CHAIN_ID = 1337;
const TOKEN = Addresses.pathUsd;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required; run this explicit E2E through the Tempo localnet orchestrator`
    );
  }
  return value;
}

function safeLoopbackRpc(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Tempo E2E test credentials require a loopback HTTP RPC URL'
    );
  }
  return url.href;
}

const rpcUrl = safeLoopbackRpc(requiredEnvironment('TEST_TEMPO_RPC_URL'));
const configuredChainId = Number(requiredEnvironment('TEST_TEMPO_CHAIN_ID'));
if (configuredChainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `Tempo E2E requires chain ID ${EXPECTED_CHAIN_ID}; received ${configuredChainId}`
  );
}

const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: 'Tempo localnet',
  nativeCurrency: { name: 'pathUSD', symbol: 'pathUSD', decimals: 6 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const accounts = [0, 1, 2].map(accountIndex =>
  mnemonicToAccount(TEST_MNEMONIC, { accountIndex })
);
const [funder, payee, payer] = accounts;
if (!funder || !payee || !payer) {
  throw new Error('Tempo E2E deterministic accounts could not be derived');
}

function tempoClientFor(account = funder): Client {
  return createClient({
    account,
    chain,
    transport: http(rpcUrl, {
      retryCount: 0,
      timeout: 30_000,
    }),
  });
}

async function fundTestAccount(
  client: Client,
  address: `0x${string}`
): Promise<void> {
  await Actions.token.transferSync(client, {
    account: funder,
    chain,
    token: TOKEN,
    to: address,
    amount: 1_000_000n,
  });
}

describe('Tempo localnet end-to-end', () => {
  const funderClient = tempoClientFor(funder);
  const payeeClient = tempoClientFor(payee);
  const payerClient = tempoClientFor(payer);

  beforeAll(async () => {
    const actualChainId = await getChainId(funderClient);
    expect(actualChainId).toBe(EXPECTED_CHAIN_ID);

    // The dev mnemonic funder is pre-funded by the node. A no-op transaction
    // warms Tempo before the deterministic pathUSD transfers.
    await sendTransactionSync(funderClient, {
      account: funder,
      chain,
    });
    await fundTestAccount(funderClient, payee.address);
    await fundTestAccount(funderClient, payer.address);
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled([
      Actions.token.transferSync(payerClient, {
        account: payer,
        chain,
        token: TOKEN,
        to: funder.address,
        amount: 900_000n,
      }),
      Actions.token.transferSync(payeeClient, {
        account: payee,
        chain,
        token: TOKEN,
        to: funder.address,
        amount: 900_000n,
      }),
    ]);
  });

  test('runs the complete TIP-1034 lifecycle through Lucid HTTP and durable storage', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-tempo-e2e-'));
    let store = createSQLiteTempoSessionStore(join(directory, 'sessions.db'), {
      namespace: 'real-chain',
    });
    const paymentStorage = createInMemoryPaymentStorage();
    const blockBefore = await getBlockNumber(funderClient);
    let server: ReturnType<typeof Bun.serve> | undefined;
    let closeAgent: (() => Promise<void>) | undefined;

    try {
      const agent = await createAgent({
        name: 'tempo-localnet-e2e',
        version: '1.0.0',
      })
        .use(lucidHttp())
        .use(
          payments({
            config: {
              payTo: payee.address,
              // Payments owns the accounting tracker used by analytics.
              // Its x402 receiver is not exercised by this MPP-only test.
              network: 'eip155:84532',
              facilitatorUrl: 'http://127.0.0.1/unused',
              policyGroups: [
                {
                  name: 'tempo-localnet-accounting',
                  incomingLimits: { global: {} },
                },
              ],
            },
            storageFactory: () => paymentStorage,
          })
        )
        .use(
          mpp({
            allowInsecureHttpForDevelopment: true,
            config: {
              methods: [
                tempoServer.session({
                  mode: 'production',
                  account: payee,
                  chainId: EXPECTED_CHAIN_ID,
                  currency: TOKEN,
                  recipient: payee.address,
                  decimals: 6,
                  amount: '0.000001',
                  unitType: 'request',
                  deposit: {
                    minimum: '0.000001',
                    suggested: '0.000005',
                    maximum: '0.000010',
                  },
                  store,
                  getClient: () => payeeClient,
                  channelStateTtlMs: Number.MAX_SAFE_INTEGER,
                }),
              ],
              defaultIntent: 'session',
              secretKey: 'tempo-localnet-e2e-secret-key-32-bytes',
            },
          })
        )
        .use(analytics())
        .build();
      closeAgent = () => agent.close();

      const agentApp = await createAgentApp(agent);
      agentApp.addEntrypoint({
        key: 'paid-report',
        description: 'Real Tempo session E2E tracer',
        price: '99',
        paymentProtocol: 'mpp',
        metadata: { mpp: { intent: 'session' } },
        input: z.object({ value: z.string() }),
        output: z.object({ echoed: z.string() }),
        handler: async ({ input }: { input: { value: string } }) => ({
          output: { echoed: input.value },
        }),
        stream: async ({ input }: { input: { value: string } }, emit) => {
          await emit({ kind: 'text', text: `${input.value}:one` });
          await emit({ kind: 'text', text: `${input.value}:two` });
          return {
            status: 'succeeded' as const,
            output: { echoed: input.value },
          };
        },
      });

      server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: agentApp.app.fetch,
      });
      const endpoint = `http://127.0.0.1:${server.port}/entrypoints/paid-report/invoke`;
      const request = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { value: 'paid on Tempo' } }),
      };

      const challenged = await fetch(endpoint, request);
      expect(challenged.status).toBe(402);

      const manager = tempoClient.session.manager({
        account: payer,
        client: payerClient,
        decimals: 6,
        maxDeposit: '0.000010',
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.status === 400) {
            throw new Error(
              `Tempo management request failed: ${await response
                .clone()
                .text()}`
            );
          }
          return response;
        },
      });
      const paid = await manager.fetch(endpoint, request);
      expect(paid.status).toBe(200);
      expect(await paid.json()).toMatchObject({
        output: { echoed: 'paid on Tempo' },
        status: 'succeeded',
      });
      expect(paid.receipt).toMatchObject({
        method: 'tempo',
        intent: 'session',
        status: 'success',
        channelId: manager.channelId,
        acceptedCumulative: '1',
        spent: '1',
      });
      expect(manager.channelId).toMatch(/^0x[0-9a-f]{64}$/i);

      const channelId = manager.channelId;
      if (!channelId) throw new Error('Tempo manager did not open a channel');
      const chainState = await Tempo.Session.Precompile.Chain.getChannelState(
        funderClient,
        channelId
      );
      expect(chainState).toEqual({
        closeRequestedAt: 0,
        deposit: 5n,
        settled: 0n,
      });

      const openedLogs = parseEventLogs({
        abi: Tempo.Session.Precompile.escrowAbi,
        eventName: 'ChannelOpened',
        logs: await getLogs(funderClient, {
          address: Tempo.Session.Precompile.Constants.tip20ChannelEscrow,
          fromBlock: blockBefore,
          toBlock: 'latest',
        }),
      });
      expect(
        openedLogs.some(
          log =>
            'channelId' in log.args &&
            log.args.channelId?.toLowerCase() === channelId.toLowerCase()
        )
      ).toBe(true);

      expect(await store.get(channelId)).toMatchObject({
        channelId,
        deposit: 5n,
        highestVoucherAmount: 1n,
        spent: 1n,
        units: 1,
      });
      const accounting = await agent.analytics.getData();
      expect(accounting.summary).toMatchObject({
        incomingCount: 1,
        incomingTotal: 0n,
      });
      expect(accounting.transactions).toHaveLength(1);
      expect(accounting.transactions[0]).toMatchObject({
        direction: 'incoming',
        groupName: 'tempo-localnet-accounting',
        scope: 'global',
      });

      const secondPaid = await manager.fetch(endpoint, request);
      expect(secondPaid.status).toBe(200);
      expect(secondPaid.channelId).toBe(channelId);
      expect(secondPaid.receipt).toMatchObject({
        channelId,
        acceptedCumulative: '2',
        spent: '2',
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 5n,
        highestVoucherAmount: 2n,
        spent: 2n,
        units: 2,
      });

      const streamReceipts: Array<{
        acceptedCumulative: string;
        channelId: string;
        spent: string;
        units?: number;
      }> = [];
      const streamEndpoint = endpoint.replace(/\/invoke$/u, '/stream');
      const stream = await manager.sse(streamEndpoint, {
        ...request,
        onReceipt: receipt => streamReceipts.push(receipt),
      });
      const streamMessages: string[] = [];
      for await (const message of stream) streamMessages.push(message);
      expect(streamMessages.join('\n')).toContain('paid on Tempo:one');
      expect(streamMessages.join('\n')).toContain('paid on Tempo:two');
      expect(streamReceipts.at(-1)).toMatchObject({
        acceptedCumulative: '4',
        channelId,
        spent: '4',
        units: 4,
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 5n,
        highestVoucherAmount: 4n,
        spent: 4n,
        units: 4,
      });

      const topUpReceipt = await manager.topUp('0.000003');
      expect(topUpReceipt).toMatchObject({
        channelId,
        status: 'success',
        txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
      });
      const toppedUpState =
        await Tempo.Session.Precompile.Chain.getChannelState(
          funderClient,
          channelId
        );
      expect(toppedUpState).toEqual({
        closeRequestedAt: 0,
        deposit: 8n,
        settled: 0n,
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 8n,
        highestVoucherAmount: 4n,
        spent: 4n,
        units: 4,
      });
      const topUpLogs = parseEventLogs({
        abi: Tempo.Session.Precompile.escrowAbi,
        eventName: 'TopUp',
        logs: await getLogs(funderClient, {
          address: Tempo.Session.Precompile.Constants.tip20ChannelEscrow,
          fromBlock: blockBefore,
          toBlock: 'latest',
        }),
      });
      expect(
        topUpLogs.some(
          log =>
            'channelId' in log.args &&
            log.args.channelId?.toLowerCase() === channelId.toLowerCase() &&
            'newDeposit' in log.args &&
            log.args.newDeposit === 8n
        )
      ).toBe(true);

      const restartPort = server.port;
      server.stop(true);
      server = undefined;
      await agent.close();
      closeAgent = undefined;
      store.close();

      store = createSQLiteTempoSessionStore(join(directory, 'sessions.db'), {
        namespace: 'real-chain',
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 8n,
        finalized: false,
        highestVoucherAmount: 4n,
        spent: 4n,
        units: 4,
      });
      const restartedAgent = await createAgent({
        name: 'tempo-localnet-e2e',
        version: '1.0.0',
      })
        .use(lucidHttp())
        .use(
          payments({
            config: {
              payTo: payee.address,
              network: 'eip155:84532',
              facilitatorUrl: 'http://127.0.0.1/unused',
              policyGroups: [
                {
                  name: 'tempo-localnet-accounting',
                  incomingLimits: { global: {} },
                },
              ],
            },
            storageFactory: () => paymentStorage,
          })
        )
        .use(
          mpp({
            allowInsecureHttpForDevelopment: true,
            config: {
              methods: [
                tempoServer.session({
                  mode: 'production',
                  account: payee,
                  chainId: EXPECTED_CHAIN_ID,
                  currency: TOKEN,
                  recipient: payee.address,
                  decimals: 6,
                  amount: '0.000001',
                  unitType: 'request',
                  deposit: {
                    minimum: '0.000001',
                    suggested: '0.000005',
                    maximum: '0.000010',
                  },
                  store,
                  getClient: () => payeeClient,
                  channelStateTtlMs: Number.MAX_SAFE_INTEGER,
                }),
              ],
              defaultIntent: 'session',
              secretKey: 'tempo-localnet-e2e-secret-key-32-bytes',
            },
          })
        )
        .use(analytics())
        .build();
      closeAgent = () => restartedAgent.close();
      const restartedApp = await createAgentApp(restartedAgent);
      restartedApp.addEntrypoint({
        key: 'paid-report',
        description: 'Real Tempo session E2E tracer',
        price: '99',
        paymentProtocol: 'mpp',
        metadata: { mpp: { intent: 'session' } },
        input: z.object({ value: z.string() }),
        output: z.object({ echoed: z.string() }),
        handler: async ({ input }: { input: { value: string } }) => ({
          output: { echoed: input.value },
        }),
      });
      server = Bun.serve({
        hostname: '127.0.0.1',
        port: restartPort,
        fetch: restartedApp.app.fetch,
      });

      const resumed = await manager.fetch(endpoint, request);
      expect(resumed.status).toBe(200);
      expect(resumed.channelId).toBe(channelId);
      expect(resumed.receipt).toMatchObject({
        acceptedCumulative: '5',
        channelId,
        spent: '5',
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 8n,
        finalized: false,
        highestVoucherAmount: 5n,
        spent: 5n,
        units: 5,
      });

      const closeReceipt = await manager.close();
      expect(closeReceipt).toMatchObject({
        channelId,
        acceptedCumulative: '5',
        spent: '5',
        status: 'success',
        txHash: expect.stringMatching(/^0x[0-9a-f]{64}$/i),
      });
      expect(manager.opened).toBe(false);
      const closeLogs = parseEventLogs({
        abi: Tempo.Session.Precompile.escrowAbi,
        eventName: 'ChannelClosed',
        logs: await getLogs(funderClient, {
          address: Tempo.Session.Precompile.Constants.tip20ChannelEscrow,
          fromBlock: blockBefore,
          toBlock: 'latest',
        }),
      });
      expect(
        closeLogs.some(
          log =>
            'channelId' in log.args &&
            log.args.channelId?.toLowerCase() === channelId.toLowerCase() &&
            'settledToPayee' in log.args &&
            log.args.settledToPayee === 5n &&
            'refundedToPayer' in log.args &&
            log.args.refundedToPayer === 3n
        )
      ).toBe(true);
      expect(await store.get(channelId)).toMatchObject({
        finalized: true,
        settledOnChain: 5n,
        spent: 5n,
        units: 5,
      });

      await restartedAgent.close();
      closeAgent = undefined;
      store.close();
      store = createSQLiteTempoSessionStore(join(directory, 'sessions.db'), {
        namespace: 'real-chain',
      });
      expect(await store.get(channelId)).toMatchObject({
        deposit: 0n,
        finalized: true,
        settledOnChain: 5n,
        spent: 5n,
        units: 5,
      });
    } finally {
      server?.stop(true);
      if (closeAgent) await closeAgent();
      store.close();
      rmSync(directory, { force: true, recursive: true });
    }
  }, 120_000);

  test('settles a native Tempo charge through the public client and Lucid HTTP', async () => {
    let server: ReturnType<typeof Bun.serve> | undefined;
    let closeAgent: (() => Promise<void>) | undefined;
    try {
      const payeeBefore = await Actions.token.getBalance(funderClient, {
        account: payee.address,
        token: TOKEN,
      });
      let handlerCalls = 0;
      const agent = await createAgent({
        name: 'tempo-charge-localnet-e2e',
        version: '1.0.0',
      })
        .use(lucidHttp())
        .use(
          mpp({
            allowInsecureHttpForDevelopment: true,
            config: {
              methods: [
                tempoServer.server({
                  chainId: EXPECTED_CHAIN_ID,
                  currency: TOKEN,
                  decimals: 6,
                  getClient: () => payeeClient,
                  recipient: payee.address,
                }),
              ],
              defaultIntent: 'charge',
            },
          })
        )
        .build();
      closeAgent = () => agent.close();
      const agentApp = await createAgentApp(agent);
      agentApp.addEntrypoint({
        key: 'charged-report',
        description: 'Real native Tempo charge E2E tracer',
        price: '0.000001',
        paymentProtocol: 'mpp',
        metadata: { mpp: { intent: 'charge' } },
        input: z.object({ value: z.string() }),
        output: z.object({ echoed: z.string() }),
        handler: async ({ input }: { input: { value: string } }) => {
          handlerCalls += 1;
          return { output: { echoed: input.value } };
        },
      });
      server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: agentApp.app.fetch,
      });
      const endpoint = `http://127.0.0.1:${server.port}/entrypoints/charged-report/invoke`;
      const request = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { value: 'charged on Tempo' } }),
      };
      expect((await fetch(endpoint, request)).status).toBe(402);

      const client = ClientMppx.create({
        methods: [
          tempoClient.charge({
            account: payer,
            expectedChainId: EXPECTED_CHAIN_ID,
            expectedRecipients: [payee.address],
            getClient: () => payerClient,
          }),
        ],
        polyfill: false,
      });
      const paid = await client.fetch(endpoint, request);
      expect(paid.status).toBe(200);
      expect(await paid.json()).toMatchObject({
        output: { echoed: 'charged on Tempo' },
        status: 'succeeded',
      });
      expect(handlerCalls).toBe(1);

      const receipt = Receipt.fromResponse(paid);
      expect(receipt).toMatchObject({
        method: 'tempo',
        status: 'success',
      });
      expect(receipt.reference).toMatch(/^0x[0-9a-f]{64}$/i);
      const transaction = await funderClient.request({
        method: 'eth_getTransactionReceipt',
        params: [receipt.reference as `0x${string}`],
      });
      expect(transaction).toMatchObject({ status: '0x1' });

      const payeeAfter = await Actions.token.getBalance(funderClient, {
        account: payee.address,
        token: TOKEN,
      });
      expect(payeeAfter.amount - payeeBefore.amount).toBe(1n);
    } finally {
      server?.stop(true);
      if (closeAgent) await closeAgent();
    }
  }, 120_000);
});
