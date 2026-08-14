import { createAgent } from '@lucid-agents/core';
import {
  createCashClient,
  cashoutResultFromJson,
  estimateFromJson,
  fillStatsFromJson,
  orderFromJson,
  prepareResultFromJson,
  type CashoutInput,
  type CashClient,
} from '@zkp2p/cash';
import { describe, expect, it } from 'bun:test';

import { peerCash } from '../index';

describe('peerCash', () => {
  it('adds serializable Peer capabilities to the Lucid runtime', async () => {
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash())
      .build();

    const capabilities = agent.peerCash.capabilities();

    expect(capabilities.token.symbol).toBe('USDC');
    expect(capabilities.token.decimals).toBe(6);
    expect(capabilities.token.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(capabilities.platforms.length).toBeGreaterThan(0);
    expect(() => JSON.stringify(capabilities)).not.toThrow();
  });

  it('returns a serializable market-rate estimate from human USDC input', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      estimate: async () =>
        estimateFromJson({
          kind: 'oracle-estimate',
          currency: 'USD',
          amount: '12500000',
          rate: 1,
          receiveAmount: 12.5,
          asOf: 1_786_700_000_000,
        }),
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const estimate = await agent.peerCash.estimate({
      amountUsdc: '12.5',
      currency: 'usd',
    });

    expect(estimate).toMatchObject({
      kind: 'oracle-estimate',
      currency: 'USD',
      amount: '12500000',
      receiveAmount: 12.5,
    });
    expect(() => JSON.stringify(estimate)).not.toThrow();
  });

  it('prepares unsigned cash-out transactions without taking wallet keys', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    let received: CashoutInput | undefined;
    const client = {
      ...baseClient,
      prepare: async (input: CashoutInput) => {
        received = input;
        return prepareResultFromJson({
          txs: [
            {
              to: '0x1111111111111111111111111111111111111111',
              data: '0x1234',
              value: '0',
              chainId: 8453,
            },
          ],
          steps: [{ kind: 'createDeposit', description: 'Create deposit' }],
          register: { hashedOnchainIds: ['0xabc'] },
          accessPolicyRequired: false,
        });
      },
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const prepared = await agent.peerCash.prepareCashout({
      amountUsdc: '25.5',
      platform: 'wise',
      currency: 'gbp',
      payee: 'recipient@example.com',
    });

    expect(received).toMatchObject({
      amount: 25_500_000n,
      receive: {
        platform: 'wise',
        currency: 'GBP',
        payee: 'recipient@example.com',
      },
    });
    expect(prepared.txs[0]).toEqual({
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      value: '0',
      chainId: 8453,
    });
    expect(() => JSON.stringify(prepared)).not.toThrow();
  });

  it('returns resumable order state as JSON', async () => {
    const depositId = '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12';
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      order: async () =>
        orderFromJson({
          depositId,
          state: 'awaiting-buyer',
          fills: [],
          totalAmount: '25500000',
          filledAmount: '0',
          pendingAmount: '0',
          returnedAmount: '0',
          nextActions: ['wait', 'withdraw'],
          isInFlight: true,
        }),
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const order = await agent.peerCash.order(depositId);

    expect(order).toMatchObject({
      depositId,
      state: 'awaiting-buyer',
      nextActions: ['wait', 'withdraw'],
    });
    expect(() => JSON.stringify(order)).not.toThrow();
  });

  it('prepares an unsigned partial withdrawal plan', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    let amount: bigint | undefined;
    const client = {
      ...baseClient,
      prepareWithdraw: async (
        _depositId: string,
        options?: { amount?: bigint }
      ) => {
        amount = options?.amount;
        return {
          txs: [
            {
              to: '0x2222222222222222222222222222222222222222',
              data: '0xabcd' as `0x${string}`,
              value: 0n,
              chainId: 8453,
            },
          ],
          steps: [
            { kind: 'removeFunds' as const, description: 'Remove funds' },
          ],
        };
      },
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const plan = await agent.peerCash.prepareWithdrawal(
      '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12',
      { amountUsdc: '5' }
    );

    expect(amount).toBe(5_000_000n);
    expect(plan).toEqual({
      txs: [
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0xabcd',
          value: '0',
          chainId: 8453,
        },
      ],
      steps: [{ kind: 'removeFunds', description: 'Remove funds' }],
    });
  });

  it('prepares an unsigned top-up plan from human USDC input', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    let amount: bigint | undefined;
    const client = {
      ...baseClient,
      prepareTopUp: async (_depositId: string, inputAmount: bigint) => {
        amount = inputAmount;
        return {
          txs: [
            {
              to: '0x3333333333333333333333333333333333333333',
              data: '0xbeef' as `0x${string}`,
              value: 0n,
              chainId: 8453,
            },
          ],
          steps: [{ kind: 'addFunds' as const, description: 'Add funds' }],
        };
      },
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const plan = await agent.peerCash.prepareTopUp(
      '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12',
      '10.25'
    );

    expect(amount).toBe(10_250_000n);
    expect(plan.steps).toEqual([
      { kind: 'addFunds', description: 'Add funds' },
    ]);
    expect(() => JSON.stringify(plan)).not.toThrow();
  });

  it('prepares the unsigned access-policy transaction when required', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      prepareAccessPolicy: () => ({
        to: '0x4444444444444444444444444444444444444444',
        data: '0xcafe' as `0x${string}`,
        value: 0n,
        chainId: 8453,
      }),
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const transaction = agent.peerCash.prepareAccessPolicy(
      '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12'
    );

    expect(transaction).toEqual({
      to: '0x4444444444444444444444444444444444444444',
      data: '0xcafe',
      value: '0',
      chainId: 8453,
    });
  });

  it('finalizes a confirmed deposit receipt into a resumable order', async () => {
    const depositId = '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12';
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      finalizePreparedCashout: () =>
        cashoutResultFromJson({
          depositId,
          txHash: `0x${'ab'.repeat(32)}`,
          escrowAddress: '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111',
          onchainDepositId: '12',
          order: {
            depositId,
            state: 'awaiting-buyer',
            fills: [],
            totalAmount: '25500000',
            filledAmount: '0',
            pendingAmount: '0',
            returnedAmount: '0',
            nextActions: ['wait', 'withdraw'],
            isInFlight: true,
          },
        }),
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const result = agent.peerCash.finalizeCashout({
      transactionHash: `0x${'ab'.repeat(32)}`,
      status: 'success',
      logs: [],
    });

    expect(result).toMatchObject({
      depositId,
      order: { state: 'awaiting-buyer' },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('returns serializable corridor demand evidence', async () => {
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      fillStats: async () =>
        fillStatsFromJson({
          'wise:GBP': { fills: 42, medianFillSeconds: 900 },
        }),
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const stats = await agent.peerCash.fillStats();

    expect(stats).toEqual({
      'wise:GBP': { fills: 42, medianFillSeconds: 900 },
    });
  });

  it('lists in-flight orders for an explicit wallet owner', async () => {
    const depositId = '0x71e18f1b6a1c1a4dfa5c1728f5b70cf4a4d5c111_12';
    const owner = '0x5555555555555555555555555555555555555555';
    const baseClient = createCashClient({ environment: 'production' });
    const client = {
      ...baseClient,
      orders: async () => [
        orderFromJson({
          depositId,
          state: 'awaiting-buyer',
          fills: [],
          totalAmount: '25500000',
          filledAmount: '0',
          pendingAmount: '0',
          returnedAmount: '0',
          nextActions: ['wait', 'withdraw'],
          isInFlight: true,
        }),
      ],
    } as CashClient;
    const agent = await createAgent({ name: 'cash-agent', version: '1.0.0' })
      .use(peerCash({ client }))
      .build();

    const orders = await agent.peerCash.orders(owner, {
      inFlight: true,
      limit: 10,
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ depositId, isInFlight: true });
    expect(() => JSON.stringify(orders)).not.toThrow();
  });
});
