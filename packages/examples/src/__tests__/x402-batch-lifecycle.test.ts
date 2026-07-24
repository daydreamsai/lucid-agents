import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import {
  type BatchChannelStorage,
  createBatchSettlementChannelManager,
  createInMemoryPaymentStorage,
  createRuntimePaymentContext,
  payments,
} from '@lucid-agents/payments';
import { createPostgresBatchChannelStorage } from '@lucid-agents/payments/storage/batch-postgres';
import { createSQLiteBatchChannelStorage } from '@lucid-agents/payments/storage/batch-sqlite';
import {
  type ClientChannelStorage,
  computeChannelId,
  signVoucher,
} from '@x402/evm/batch-settlement/client';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { encodeAbiParameters } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

const NETWORK = 'eip155:84532';
const ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BUYER_KEY =
  '0xac0974bec39a17e36ba6a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const SELLER_KEY =
  '0x59c6995e998f97a5a0044966f094538a009d74290f5811cfba6a6b4d238ff944';
const AUTHORIZER_KEY =
  '0x5de4111afa1c4b3daadb435b6b1e7349f0e252355925e0784dc4c6d608f3220d';
const FACILITATOR = 'https://batch-facilitator.test';
const RPC = 'https://batch-rpc.test';
const RESOURCE = 'http://internal-runtime/entrypoints/batch-report/invoke';

type BatchPaymentEnvelope = {
  payload: {
    type: string;
    channelConfig: {
      payer: `0x${string}`;
      payerAuthorizer: `0x${string}`;
      receiver: `0x${string}`;
      receiverAuthorizer: `0x${string}`;
      token: `0x${string}`;
      withdrawDelay: number;
      salt: `0x${string}`;
    };
    voucher: {
      channelId: `0x${string}`;
      maxClaimableAmount: string;
      signature: `0x${string}`;
    };
    deposit?: {
      authorization: {
        erc3009Authorization: {
          validBefore: string;
        };
      };
    };
  };
};

async function rewritePayment(
  request: Request,
  rewrite: (payment: BatchPaymentEnvelope) => Promise<void> | void
): Promise<Request> {
  const header = request.headers.get('PAYMENT-SIGNATURE');
  if (!header) throw new Error('Expected a paid batch request');
  const payment = JSON.parse(
    Buffer.from(header, 'base64').toString('utf8')
  ) as BatchPaymentEnvelope;
  await rewrite(payment);
  const headers = new Headers(request.headers);
  headers.set(
    'PAYMENT-SIGNATURE',
    Buffer.from(JSON.stringify(payment)).toString('base64')
  );
  return new Request(request.url, {
    method: request.method,
    headers,
    body: await request.clone().text(),
  });
}

async function replaceVoucher(
  request: Request,
  maxClaimableAmount: string,
  signature: string
): Promise<Request> {
  return rewritePayment(request, payment => {
    payment.payload.voucher.maxClaimableAmount = maxClaimableAmount;
    payment.payload.voucher.signature = signature as `0x${string}`;
  });
}

type ClientContext = NonNullable<
  Awaited<ReturnType<ClientChannelStorage['get']>>
>;

class SQLiteClientChannelStorage implements ClientChannelStorage {
  private readonly _database: Database;
  private _closed = false;

  constructor(path: string) {
    this._database = new Database(path);
    this._database.exec(`
      CREATE TABLE IF NOT EXISTS x402_batch_client_channels (
        channel_id TEXT PRIMARY KEY,
        context_json TEXT NOT NULL
      )
    `);
  }

  private ensureOpen(): void {
    if (this._closed) throw new Error('Client channel storage is closed');
  }

  async get(key: string): Promise<ClientContext | undefined> {
    this.ensureOpen();
    const row = this._database
      .prepare(
        'SELECT context_json FROM x402_batch_client_channels WHERE channel_id = ?'
      )
      .get(key.toLowerCase()) as { context_json: string } | undefined;
    return row ? (JSON.parse(row.context_json) as ClientContext) : undefined;
  }

  async set(key: string, context: ClientContext): Promise<void> {
    this.ensureOpen();
    this._database
      .prepare(
        `INSERT INTO x402_batch_client_channels (channel_id, context_json)
         VALUES (?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET context_json = excluded.context_json`
      )
      .run(key.toLowerCase(), JSON.stringify(context));
  }

  async delete(key: string): Promise<void> {
    this.ensureOpen();
    this._database
      .prepare('DELETE FROM x402_batch_client_channels WHERE channel_id = ?')
      .run(key.toLowerCase());
  }

  values(): ClientContext[] {
    this.ensureOpen();
    const rows = this._database
      .prepare(
        'SELECT context_json FROM x402_batch_client_channels ORDER BY channel_id'
      )
      .all() as Array<{ context_json: string }>;
    return rows.map(row => JSON.parse(row.context_json) as ClientContext);
  }

  close(): void {
    if (this._closed) return;
    this._database.close();
    this._closed = true;
  }
}

type FacilitatorRequest = {
  paymentPayload: {
    payload: {
      type: 'deposit' | 'voucher' | 'claim' | 'settle' | 'refund';
      voucher?: { channelId: string; maxClaimableAmount: string };
      deposit?: { amount: string };
      channelConfig?: BatchPaymentEnvelope['payload']['channelConfig'];
    };
  };
  paymentRequirements: { amount: string };
};

class IsolatedBatchLedger {
  readonly payloadTypes: string[] = [];
  balance = 0n;
  totalClaimed = 0n;
  private _payerBalance = 0n;
  private _escrowBalance = 0n;
  private _sellerPending = 0n;
  private _sellerBalance = 0n;

  constructor(
    private readonly _payer: string,
    private readonly _receiverAuthorizer: string
  ) {}

  fund(amount: bigint): void {
    this._payerBalance = amount;
  }

  deposit(amount: bigint): void {
    this._payerBalance -= amount;
    this._escrowBalance += amount;
    this.balance += amount;
  }

  snapshot(): {
    payer: bigint;
    escrow: bigint;
    sellerPending: bigint;
    seller: bigint;
  } {
    return {
      payer: this._payerBalance,
      escrow: this._escrowBalance,
      sellerPending: this._sellerPending,
      seller: this._sellerBalance,
    };
  }

  managerFacilitator(): Parameters<
    typeof createBatchSettlementChannelManager
  >[0]['facilitator'] {
    return {
      getSupported: async () => ({
        kinds: [],
        extensions: [],
        signers: {},
      }),
      verify: async () => ({ isValid: false }),
      settle: async payment => {
        const payload = payment.payload as {
          type: 'claim' | 'settle' | 'refund';
          claims?: Array<{ totalClaimed: string }>;
          amount?: string;
        };
        if (payload.type === 'claim') {
          const claimed = (payload.claims ?? []).reduce(
            (total, claim) => total + BigInt(claim.totalClaimed),
            0n
          );
          const delta = claimed - this.totalClaimed;
          this.totalClaimed = claimed;
          this._escrowBalance -= delta;
          this._sellerPending += delta;
          return {
            success: true,
            payer: this._payer,
            transaction: `0x${'21'.repeat(32)}`,
            network: NETWORK,
          };
        }
        if (payload.type === 'settle') {
          this._sellerBalance += this._sellerPending;
          this._sellerPending = 0n;
          return {
            success: true,
            payer: this._payer,
            transaction: `0x${'22'.repeat(32)}`,
            network: NETWORK,
          };
        }
        const refund = BigInt(payload.amount ?? 0);
        this._escrowBalance -= refund;
        this._payerBalance += refund;
        return {
          success: true,
          payer: this._payer,
          transaction: `0x${'23'.repeat(32)}`,
          network: NETWORK,
        };
      },
    };
  }

  supported(): Response {
    return Response.json({
      kinds: [
        {
          x402Version: 2,
          scheme: 'batch-settlement',
          network: NETWORK,
          asset: {
            address: ASSET,
            decimals: 6,
            eip712: { name: 'USDC', version: '2' },
          },
          extra: { receiverAuthorizer: this._receiverAuthorizer },
        },
      ],
      extensions: [],
      signers: {},
    });
  }

  async verify(request: Request): Promise<Response> {
    const body = (await request.json()) as FacilitatorRequest;
    const payload = body.paymentPayload.payload;
    this.payloadTypes.push(`verify:${payload.type}`);
    if (
      payload.type === 'deposit' &&
      BigInt(
        (payload as unknown as BatchPaymentEnvelope['payload']).deposit
          ?.authorization.erc3009Authorization.validBefore ?? 0
      ) <= BigInt(Math.floor(Date.now() / 1_000))
    ) {
      return Response.json({
        isValid: false,
        payer: this._payer,
        invalidReason:
          'invalid_batch_settlement_evm_payload_authorization_valid_before',
      });
    }
    const deposit = BigInt(payload.deposit?.amount ?? 0);
    return Response.json({
      isValid: true,
      payer: this._payer,
      extra: {
        balance: (this.balance + deposit).toString(),
        totalClaimed: this.totalClaimed.toString(),
        withdrawRequestedAt: 0,
        refundNonce: '0',
      },
    });
  }

  async settle(request: Request): Promise<Response> {
    const body = (await request.json()) as FacilitatorRequest;
    const payload = body.paymentPayload.payload;
    this.payloadTypes.push(`settle:${payload.type}`);
    if (payload.type === 'deposit') {
      this.deposit(BigInt(payload.deposit?.amount ?? 0));
    }
    return Response.json({
      success: true,
      payer: this._payer,
      transaction: `0x${'12'.repeat(32)}`,
      network: NETWORK,
      amount: body.paymentRequirements.amount,
      extra: {
        channelState: {
          channelId: payload.voucher?.channelId,
          balance: this.balance.toString(),
          totalClaimed: this.totalClaimed.toString(),
          withdrawRequestedAt: 0,
          refundNonce: '0',
        },
      },
    });
  }
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function createBatchSeller(
  storage: BatchChannelStorage,
  accounting: ReturnType<typeof createInMemoryPaymentStorage>,
  onExecute: () => void
) {
  const seller = privateKeyToAccount(SELLER_KEY);
  const authorizer = privateKeyToAccount(AUTHORIZER_KEY);
  const agent = await createAgent({
    name: 'batch-lifecycle',
    version: '1.0.0',
  })
    .use(http())
    .use(
      payments({
        config: {
          payTo: seller.address,
          network: NETWORK,
          facilitatorUrl: FACILITATOR,
          policyGroups: [
            {
              name: 'batch-accounting',
              incomingLimits: { global: {} },
            },
          ],
        },
        storageFactory: () => accounting,
        batchSettlement: {
          mode: 'production',
          storage,
          receiverAuthorizerSigner: authorizer,
        },
      })
    )
    .build();
  const { app, addEntrypoint } = await createAgentApp(agent);
  addEntrypoint({
    key: 'batch-report',
    paymentProtocol: 'x402',
    x402: {
      offers: [
        {
          scheme: 'batch-settlement',
          network: NETWORK,
          maximum: { amount: '7', asset: ASSET },
        },
      ],
    },
    input: z.object({ sequence: z.number().int() }),
    output: z.object({ sequence: z.number().int() }),
    handler: async context => {
      onExecute();
      return { output: { sequence: context.input.sequence } };
    },
  });
  return { agent, app, storage };
}

async function assertTerminalChannelEconomics(
  storage: BatchChannelStorage
): Promise<void> {
  const buyer = privateKeyToAccount(BUYER_KEY);
  const seller = privateKeyToAccount(SELLER_KEY);
  const authorizer = privateKeyToAccount(AUTHORIZER_KEY);
  const ledger = new IsolatedBatchLedger(buyer.address, authorizer.address);
  ledger.fund(1_000n);
  ledger.deposit(70n);
  const channelConfig = {
    payer: buyer.address,
    payerAuthorizer: buyer.address,
    receiver: seller.address,
    receiverAuthorizer: authorizer.address,
    token: ASSET,
    withdrawDelay: 900,
    salt: `0x${'cd'.repeat(32)}` as const,
  };
  const channelId = computeChannelId(channelConfig, NETWORK);
  const voucher = await signVoucher(buyer, channelId, '14', NETWORK);
  await storage.updateChannel(channelId, () => ({
    channelId,
    channelConfig,
    chargedCumulativeAmount: '14',
    signedMaxClaimable: '14',
    signature: voucher.signature,
    balance: '70',
    totalClaimed: '0',
    withdrawRequestedAt: 0,
    refundNonce: 0,
    lastRequestTimestamp: 1,
  }));
  const { manager } = createBatchSettlementChannelManager({
    receiver: seller.address,
    network: NETWORK,
    facilitator: ledger.managerFacilitator(),
    server: {
      mode: 'production',
      storage,
      receiverAuthorizerSigner: authorizer,
    },
  });

  try {
    expect(await manager.claim()).toEqual([
      { vouchers: 1, transaction: `0x${'21'.repeat(32)}` },
    ]);
    expect((await storage.get(channelId))?.totalClaimed).toBe('14');
    expect(ledger.snapshot()).toEqual({
      payer: 930n,
      escrow: 56n,
      sellerPending: 14n,
      seller: 0n,
    });

    expect(await manager.settle()).toEqual({
      transaction: `0x${'22'.repeat(32)}`,
    });
    expect(ledger.snapshot()).toEqual({
      payer: 930n,
      escrow: 56n,
      sellerPending: 0n,
      seller: 14n,
    });

    expect(await manager.refundIdleChannels({ idleSecs: 0 })).toEqual([
      {
        channel: channelId,
        transaction: `0x${'23'.repeat(32)}`,
      },
    ]);
    expect(await storage.get(channelId)).toBeUndefined();
    expect(ledger.snapshot()).toEqual({
      payer: 986n,
      escrow: 0n,
      sellerPending: 0n,
      seller: 14n,
    });
  } finally {
    await manager.stop();
    await storage.close();
  }
}

async function assertBuyerSellerLifecycle(
  createSellerStorage: (directory: string) => BatchChannelStorage
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-e2e-'));
  temporaryDirectories.push(directory);
  const authorizer = privateKeyToAccount(AUTHORIZER_KEY);
  const buyer = privateKeyToAccount(BUYER_KEY);
  const ledger = new IsolatedBatchLedger(buyer.address, authorizer.address);
  ledger.fund(1_000n);
  const initialStorage = createSellerStorage(directory);
  const accounting = createInMemoryPaymentStorage();
  let executions = 0;
  const initialSeller = await createBatchSeller(
    initialStorage,
    accounting,
    () => {
      executions += 1;
    }
  );
  type SellerInstance = Awaited<ReturnType<typeof createBatchSeller>>;
  let activeSellers: SellerInstance[] = [initialSeller];
  let initialSellerClosed = false;
  const buyerStoragePath = join(directory, 'buyer.db');
  let activeBuyerStorage = new SQLiteClientChannelStorage(buyerStoragePath);

  const originalFetch = globalThis.fetch;
  let dropResponseForAmount: string | undefined;
  let duplicateVoucherAmount: string | undefined;
  let duplicateStatuses: number[] = [];
  const paidRequests: Request[] = [];
  const routedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.startsWith(FACILITATOR)) {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/supported')) return ledger.supported();
      if (path.endsWith('/verify')) return ledger.verify(request);
      if (path.endsWith('/settle')) return ledger.settle(request);
    }
    if (request.url.startsWith(RPC)) {
      const rpc = (await request.json()) as {
        id: number;
        method: string;
      };
      if (rpc.method !== 'eth_call') {
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: -32601, message: 'unsupported test RPC method' },
        });
      }
      return Response.json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: encodeAbiParameters(
          [{ type: 'uint128' }, { type: 'uint128' }],
          [ledger.balance, ledger.totalClaimed]
        ),
      });
    }
    if (request.url.startsWith('http://internal-runtime/')) {
      const paymentHeader = request.headers.get('PAYMENT-SIGNATURE');
      let voucherAmount: string | undefined;
      if (paymentHeader) {
        paidRequests.push(request.clone());
        const payment = JSON.parse(
          Buffer.from(paymentHeader, 'base64').toString('utf8')
        ) as BatchPaymentEnvelope;
        voucherAmount = payment.payload.voucher.maxClaimableAmount;
      }
      if (
        dropResponseForAmount !== undefined &&
        dropResponseForAmount === voucherAmount
      ) {
        dropResponseForAmount = undefined;
        await activeSellers[0]!.app.fetch(request);
        throw new TypeError(
          'Simulated connection reset after the seller committed the voucher'
        );
      }
      if (
        duplicateVoucherAmount !== undefined &&
        duplicateVoucherAmount === voucherAmount
      ) {
        duplicateVoucherAmount = undefined;
        const responses = await Promise.all([
          activeSellers[0]!.app.fetch(request.clone()),
          activeSellers[1]!.app.fetch(request.clone()),
        ]);
        duplicateStatuses = responses.map(response => response.status);
        return (
          responses.find(response => response.status === 200) ?? responses[0]!
        );
      }
      return activeSellers[0]!.app.fetch(request);
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  };
  globalThis.fetch = routedFetch;
  try {
    const initialClient = await createRuntimePaymentContext({
      privateKey: BUYER_KEY,
      network: 'base-sepolia',
      fetch: routedFetch,
      batchSettlement: {
        storage: activeBuyerStorage,
        depositStrategy: () => '70',
        salt: `0x${'ab'.repeat(32)}`,
      },
    });
    const invokeWith = (
      client: Awaited<ReturnType<typeof createRuntimePaymentContext>>,
      sequence: number
    ) =>
      client.fetchWithPayment?.(RESOURCE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { sequence } }),
      });

    dropResponseForAmount = '7';
    await expect(invokeWith(initialClient, 1)).rejects.toThrow(
      'connection reset after the seller committed'
    );
    expect((await initialStorage.list())[0]).toMatchObject({
      balance: '70',
      chargedCumulativeAmount: '7',
      signedMaxClaimable: '7',
    });
    expect(activeBuyerStorage.values()).toEqual([]);

    const coldBuyerStorage = activeBuyerStorage;
    coldBuyerStorage.close();
    expect(() => coldBuyerStorage.values()).toThrow('closed');
    activeBuyerStorage = new SQLiteClientChannelStorage(buyerStoragePath);
    const client = await createRuntimePaymentContext({
      privateKey: BUYER_KEY,
      network: 'base-sepolia',
      fetch: routedFetch,
      batchSettlement: {
        storage: activeBuyerStorage,
        depositStrategy: () => '70',
        salt: `0x${'ab'.repeat(32)}`,
        rpcUrl: RPC,
      },
    });
    const second = await invokeWith(client, 2);
    expect(second?.status).toBe(200);
    expect(activeBuyerStorage.values()).toEqual([
      expect.objectContaining({
        balance: '70',
        chargedCumulativeAmount: '14',
      }),
    ]);
    expect(ledger.balance).toBe(70n);

    const wrongDeposit = await activeSellers[0]!.app.fetch(
      await rewritePayment(paidRequests[0]!, payment => {
        payment.payload.voucher.channelId = `0x${'ff'.repeat(32)}`;
      })
    );
    const expiredDeposit = await activeSellers[0]!.app.fetch(
      await rewritePayment(paidRequests[0]!, async payment => {
        payment.payload.channelConfig.salt = `0x${'ee'.repeat(32)}`;
        const channelId = computeChannelId(
          payment.payload.channelConfig,
          NETWORK
        );
        payment.payload.voucher = await signVoucher(
          buyer,
          channelId,
          '7',
          NETWORK
        );
        payment.payload.deposit!.authorization.erc3009Authorization.validBefore =
          '0';
      })
    );
    expect(wrongDeposit.status).toBe(503);
    expect(expiredDeposit.status).toBe(503);
    const requestAt14 = paidRequests.find(request => {
      const encoded = request.headers.get('PAYMENT-SIGNATURE');
      if (!encoded) return false;
      const payment = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8')
      ) as BatchPaymentEnvelope;
      return payment.payload.voucher.maxClaimableAmount === '14';
    });
    const replay = await activeSellers[0]!.app.fetch(requestAt14!.clone());
    const [persistedBeforeRestart] = await initialStorage.list();
    await initialSeller.agent.close();
    initialSellerClosed = true;
    await expect(
      initialStorage.get(persistedBeforeRestart!.channelId)
    ).rejects.toThrow('closed');
    const firstReplicaStorage = createSellerStorage(directory);
    const secondReplicaStorage = createSellerStorage(directory);
    activeSellers = await Promise.all([
      createBatchSeller(firstReplicaStorage, accounting, () => {
        executions += 1;
      }),
      createBatchSeller(secondReplicaStorage, accounting, () => {
        executions += 1;
      }),
    ]);
    expect(activeSellers[0]!.app).not.toBe(activeSellers[1]!.app);
    expect(activeSellers[0]!.storage).not.toBe(activeSellers[1]!.storage);
    expect((await firstReplicaStorage.list())[0]?.chargedCumulativeAmount).toBe(
      '14'
    );
    const [activeChannel] = await firstReplicaStorage.list();
    await firstReplicaStorage.updateChannel(
      activeChannel!.channelId,
      current =>
        current
          ? {
              ...current,
              pendingRequest: {
                pendingId: 'expired-request',
                signedMaxClaimable: current.signedMaxClaimable,
                expiresAt: Date.now() - 1,
              },
            }
          : current
    );

    dropResponseForAmount = '21';
    await expect(invokeWith(client, 3)).rejects.toThrow(
      'connection reset after the seller committed'
    );
    expect((await firstReplicaStorage.list())[0]).toMatchObject({
      chargedCumulativeAmount: '21',
      signedMaxClaimable: '21',
    });
    expect(activeBuyerStorage.values()).toEqual([
      expect.objectContaining({
        balance: '70',
        chargedCumulativeAmount: '14',
      }),
    ]);

    const closedBuyerStorage = activeBuyerStorage;
    closedBuyerStorage.close();
    await expect(
      closedBuyerStorage.get(persistedBeforeRestart!.channelId)
    ).rejects.toThrow('closed');
    activeBuyerStorage = new SQLiteClientChannelStorage(buyerStoragePath);
    const restartedClient = await createRuntimePaymentContext({
      privateKey: BUYER_KEY,
      network: 'base-sepolia',
      fetch: routedFetch,
      batchSettlement: {
        storage: activeBuyerStorage,
        depositStrategy: () => '70',
        salt: `0x${'ab'.repeat(32)}`,
        rpcUrl: RPC,
      },
    });
    duplicateVoucherAmount = '28';
    const recovered = await restartedClient.fetchWithPayment?.(RESOURCE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { sequence: 4 } }),
    });
    const requestAt28 = paidRequests.find(request => {
      const encoded = request.headers.get('PAYMENT-SIGNATURE');
      if (!encoded) return false;
      const payment = JSON.parse(
        Buffer.from(encoded, 'base64').toString('utf8')
      ) as BatchPaymentEnvelope;
      return payment.payload.voucher.maxClaimableAmount === '28';
    });
    const invalidSignature = await activeSellers[0]!.app.fetch(
      await replaceVoucher(requestAt28!, '35', `0x${'00'.repeat(65)}`)
    );

    expect(second?.status).toBe(200);
    expect(replay.status).toBe(402);
    expect(recovered?.status).toBe(200);
    expect(dropResponseForAmount).toBeUndefined();
    expect(duplicateVoucherAmount).toBeUndefined();
    expect(duplicateStatuses.filter(status => status === 200)).toHaveLength(1);
    expect(duplicateStatuses.filter(status => status !== 200)).toHaveLength(1);
    expect([402, 503]).toContain(
      duplicateStatuses.find(status => status !== 200)
    );
    expect(invalidSignature.status).toBe(503);
    expect(executions).toBe(4);
    expect(ledger.payloadTypes).toEqual([
      'verify:deposit',
      'settle:deposit',
      'verify:deposit',
    ]);
    expect(ledger.balance).toBe(70n);
    expect(activeBuyerStorage.values()).toEqual([
      expect.objectContaining({
        balance: '70',
        chargedCumulativeAmount: '28',
      }),
    ]);
    const [sellerChannel] = await firstReplicaStorage.list();
    expect(sellerChannel).toMatchObject({
      balance: '70',
      chargedCumulativeAmount: '28',
      signedMaxClaimable: '28',
    });
    expect(sellerChannel?.pendingRequest).toBeUndefined();
    expect(
      await activeSellers[0]!.agent.payments?.paymentTracker?.getIncomingTotal(
        'batch-accounting',
        'global'
      )
    ).toBe(28n);
    expect(ledger.snapshot()).toEqual({
      payer: 930n,
      escrow: 70n,
      sellerPending: 0n,
      seller: 0n,
    });

    const seller = privateKeyToAccount(SELLER_KEY);
    const { manager } = createBatchSettlementChannelManager({
      receiver: seller.address,
      network: NETWORK,
      facilitator: ledger.managerFacilitator(),
      server: {
        mode: 'production',
        storage: firstReplicaStorage,
        receiverAuthorizerSigner: authorizer,
      },
    });
    try {
      expect(await manager.claim()).toEqual([
        { vouchers: 1, transaction: `0x${'21'.repeat(32)}` },
      ]);
      expect((await firstReplicaStorage.list())[0]).toMatchObject({
        channelId: sellerChannel?.channelId,
        chargedCumulativeAmount: '28',
        totalClaimed: '28',
      });
      expect(ledger.snapshot()).toEqual({
        payer: 930n,
        escrow: 42n,
        sellerPending: 28n,
        seller: 0n,
      });

      expect(await manager.settle()).toEqual({
        transaction: `0x${'22'.repeat(32)}`,
      });
      expect(ledger.snapshot()).toEqual({
        payer: 930n,
        escrow: 42n,
        sellerPending: 0n,
        seller: 28n,
      });
    } finally {
      await manager.stop();
    }
  } finally {
    globalThis.fetch = originalFetch;
    activeBuyerStorage.close();
    await Promise.all(activeSellers.map(seller => seller.agent.close()));
    if (!initialSellerClosed && !activeSellers.includes(initialSeller)) {
      await initialSeller.agent.close();
    }
  }
}

describe('deterministic x402 batch lifecycle', () => {
  test('SQLite passes the buyer-to-seller restart and race contract', async () => {
    const namespace = `batch-seller-${crypto.randomUUID()}`;
    await assertBuyerSellerLifecycle(directory =>
      createSQLiteBatchChannelStorage(join(directory, 'seller.db'), {
        namespace,
      })
    );
  });

  test('claim, settlement, and refund preserve the terminal channel economics', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-batch-terminal-'));
    temporaryDirectories.push(directory);
    const storage = createSQLiteBatchChannelStorage(
      join(directory, 'terminal.db'),
      { namespace: 'terminal-seller' }
    );
    await assertTerminalChannelEconomics(storage);
  });

  const paymentE2ePostgresUrl = process.env.TEST_PAYMENT_E2E_POSTGRES_URL;
  if (paymentE2ePostgresUrl) {
    test('Postgres passes the buyer-to-seller restart and race contract', async () => {
      const namespace = `batch-seller-${crypto.randomUUID()}`;
      await assertBuyerSellerLifecycle(() =>
        createPostgresBatchChannelStorage(paymentE2ePostgresUrl, {
          namespace,
        })
      );
    });

    test('Postgres passes the same terminal channel economics contract', async () => {
      const storage = createPostgresBatchChannelStorage(paymentE2ePostgresUrl, {
        namespace: `terminal-${crypto.randomUUID()}`,
      });
      await assertTerminalChannelEconomics(storage);
    });
  }
});
