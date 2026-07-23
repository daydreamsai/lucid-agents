import type { BuildContext, EntrypointDef } from '@lucid-agents/types/core';
import type {
  EvmSettle,
  EvmSettlementStrategy,
  MppRuntime,
} from '@lucid-agents/types/mpp';
import { describe, expect, it } from 'bun:test';
import { Mppx as ClientMppx } from 'mppx/client';
import { evm as evmClient } from 'mppx/client';
import { Header as X402Header } from 'mppx/x402';
import { privateKeyToAccount } from 'viem/accounts';

import { mpp } from '../extension';
import { evm } from '../methods';

const account = privateKeyToAccount(
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);
const currency = '0x0000000000000000000000000000000000000001';
const recipient = '0x0000000000000000000000000000000000000002';
const secretKey = 'mpp-evm-test-secret-key-with-32-bytes';
const paidEntrypoint: EntrypointDef = {
  key: 'paid',
  description: 'Paid EVM operation',
  price: '1.25',
};
const buildContext = {
  meta: { name: 'mpp-evm-test', version: '1.0.0' },
  runtime: {},
} as BuildContext;

async function buildEvmRuntime(settle: EvmSettle): Promise<MppRuntime> {
  return buildRuntimeWithSettlement({ type: 'custom', settle });
}

async function buildRuntimeWithSettlement(
  settlement: EvmSettlementStrategy
): Promise<MppRuntime> {
  const extension = mpp({
    config: {
      methods: [
        evm.server({
          chainId: 84532,
          currency,
          recipient,
          decimals: 6,
          authorization: { name: 'USD Coin', version: '2' },
          settlement,
        }),
      ],
      secretKey,
    },
  });
  const slice = await extension.build(buildContext);
  if (!slice.mpp) throw new Error('Expected MPP runtime');
  slice.mpp.activate(paidEntrypoint);
  return slice.mpp;
}

function requirement(runtime: MppRuntime) {
  const value = runtime.requirements(paidEntrypoint, 'invoke');
  if (!value.required) throw new Error('Expected payment requirement');
  return value;
}

async function challenge(
  runtime: MppRuntime,
  request = new Request('https://agent.test/paid')
): Promise<Response> {
  const result = await runtime.authorize(
    request,
    paidEntrypoint,
    'invoke',
    requirement(runtime)
  );
  if (result.authorized) throw new Error('Expected payment challenge');
  expect(result.response.status).toBe(402);
  return result.response;
}

describe('EVM charge method', () => {
  it('builds one typed server descriptor with one settlement strategy', () => {
    const settle = async () => ({ reference: '0xsettled' });
    const descriptor = evm.server({
      chainId: 84532,
      currency,
      recipient,
      decimals: 6,
      authorization: { name: 'USD Coin', version: '2' },
      settlement: { type: 'custom', settle },
    });

    expect(descriptor).toEqual({
      name: 'evm',
      implementation: 'evm',
      config: {
        chainId: 84532,
        currency,
        recipient,
        decimals: 6,
        authorization: { name: 'USD Coin', version: '2' },
        settlement: { type: 'custom', settle },
      },
    });
  });

  it('authorizes a native Payment Authentication buyer credential', async () => {
    let settlements = 0;
    const runtime = await buildEvmRuntime(async ({ payload, request }) => {
      settlements += 1;
      expect(payload.from.toLowerCase()).toBe(account.address.toLowerCase());
      expect(request.amount).toBe('1250000');
      return { reference: '0xnative' };
    });
    const response = await challenge(runtime);
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
    const credential = await client.createCredential(response);
    const result = await runtime.authorize(
      new Request('https://agent.test/paid', {
        headers: { Authorization: credential },
      }),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );

    expect(result).toMatchObject({
      authorized: true,
      payer: account.address,
      network: 'eip155:84532',
      payment: {
        amount: '1.25',
        currency,
        intent: 'charge',
        method: 'evm',
      },
    });
    if (!result.authorized) throw new Error('Expected authorization');
    expect(result.receipt).toBeTruthy();
    expect(settlements).toBe(1);
  });

  it('does not retry an ambiguous native settlement failure', async () => {
    let settlements = 0;
    const runtime = await buildEvmRuntime(async () => {
      settlements += 1;
      throw new Error('receipt transport failed after commit');
    });
    const response = await challenge(runtime);
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
    const credential = await client.createCredential(response);
    const paidRequest = () =>
      new Request('https://agent.test/paid', {
        headers: { Authorization: credential },
      });

    expect(
      (
        await runtime.authorize(
          paidRequest(),
          paidEntrypoint,
          'invoke',
          requirement(runtime)
        )
      ).authorized
    ).toBe(false);
    expect(
      (
        await runtime.authorize(
          paidRequest(),
          paidEntrypoint,
          'invoke',
          requirement(runtime)
        )
      ).authorized
    ).toBe(false);
    expect(settlements).toBe(1);
  });

  it('accepts a compatible x402 exact credential through the same EVM rail once', async () => {
    let settlements = 0;
    const runtime = await buildEvmRuntime(async () => {
      settlements += 1;
      return { reference: '0xx402' };
    });
    const response = await challenge(runtime);
    const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
    expect(paymentRequired).toBeTruthy();
    const x402Challenge = new Response(null, {
      status: 402,
      headers: { 'PAYMENT-REQUIRED': paymentRequired! },
    });
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
    const paymentSignature = await client.createCredential(x402Challenge);
    const paidRequest = () =>
      new Request('https://agent.test/paid', {
        headers: { 'PAYMENT-SIGNATURE': paymentSignature },
      });

    const accepted = await runtime.authorize(
      paidRequest(),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );
    expect(accepted).toMatchObject({
      authorized: true,
      payer: account.address,
      network: 'eip155:84532',
      payment: {
        amount: '1.25',
        currency,
        intent: 'charge',
        method: 'evm',
      },
    });
    if (!accepted.authorized) throw new Error('Expected authorization');
    expect(accepted.receipt).toBeTruthy();
    const paymentResponse = accepted.responseHeaders?.['PAYMENT-RESPONSE'];
    expect(paymentResponse).toBeTruthy();
    expect(X402Header.decodePaymentResponse(paymentResponse!)).toEqual({
      network: 'eip155:84532',
      payer: account.address,
      success: true,
      transaction: '0xx402',
    });
    expect(settlements).toBe(1);

    const replay = await runtime.authorize(
      paidRequest(),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );
    expect(replay.authorized).toBe(false);
    expect(settlements).toBe(1);
  });

  it('rejects invalid signatures before settlement', async () => {
    let settlements = 0;
    const runtime = await buildEvmRuntime(async () => {
      settlements += 1;
      return { reference: '0xinvalid' };
    });
    const response = await challenge(runtime);
    const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
    if (!paymentRequired) throw new Error('Expected x402 challenge');
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
    const signed = await client.createCredential(
      new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': paymentRequired },
      })
    );
    const decoded = X402Header.decodePaymentSignature(signed);
    if (!('authorization' in decoded.payload)) {
      throw new Error('Expected EIP-3009 authorization');
    }
    const invalid = X402Header.encodePaymentSignature({
      ...decoded,
      payload: {
        ...decoded.payload,
        authorization: {
          ...decoded.payload.authorization,
          from: recipient,
        },
      },
    });

    const result = await runtime.authorize(
      new Request('https://agent.test/paid', {
        headers: { 'PAYMENT-SIGNATURE': invalid },
      }),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );

    expect(result.authorized).toBe(false);
    expect(settlements).toBe(0);
  });

  it('binds x402 exact credentials to the selected route and request body', async () => {
    let settlements = 0;
    const runtime = await buildEvmRuntime(async () => {
      settlements += 1;
      return { reference: '0xbound' };
    });
    const originalBody = JSON.stringify({ prompt: 'original' });
    const response = await challenge(
      runtime,
      new Request('https://agent.test/paid?mode=fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: originalBody,
      })
    );
    const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
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
    const signature = await client.createCredential(
      new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': paymentRequired! },
      })
    );

    const wrongBody = await runtime.authorize(
      new Request('https://agent.test/paid?mode=fast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': signature,
        },
        body: JSON.stringify({ prompt: 'changed' }),
      }),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );
    expect(wrongBody.authorized).toBe(false);
    expect(settlements).toBe(0);

    const secondRuntime = await buildEvmRuntime(async () => {
      settlements += 1;
      return { reference: '0xroute' };
    });
    const secondResponse = await challenge(
      secondRuntime,
      new Request('https://agent.test/paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: originalBody,
      })
    );
    const secondRequired = secondResponse.headers.get('PAYMENT-REQUIRED');
    if (!secondRequired) throw new Error('Expected x402 challenge');
    const secondSignature = await client.createCredential(
      new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': secondRequired },
      })
    );
    const wrongRoute = await secondRuntime.authorize(
      new Request('https://agent.test/other', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': secondSignature,
        },
        body: originalBody,
      }),
      paidEntrypoint,
      'invoke',
      requirement(secondRuntime)
    );
    expect(wrongRoute.authorized).toBe(false);
    expect(settlements).toBe(0);
  });

  it('fails closed when facilitator settlement fails', async () => {
    let verifies = 0;
    let settlements = 0;
    const runtime = await buildRuntimeWithSettlement({
      type: 'facilitator',
      facilitator: {
        async verify() {
          verifies += 1;
          return { isValid: true, payer: account.address };
        },
        async settle() {
          settlements += 1;
          return {
            network: 'eip155:84532',
            success: false,
            transaction: '',
            errorReason: 'settlement_failed',
          };
        },
      },
    });
    const response = await challenge(runtime);
    const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
    if (!paymentRequired) throw new Error('Expected x402 challenge');
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
    const signature = await client.createCredential(
      new Response(null, {
        status: 402,
        headers: { 'PAYMENT-REQUIRED': paymentRequired },
      })
    );
    const paidRequest = () =>
      new Request('https://agent.test/paid', {
        headers: { 'PAYMENT-SIGNATURE': signature },
      });

    const failed = await runtime.authorize(
      paidRequest(),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );
    expect(failed.authorized).toBe(false);
    expect(verifies).toBe(1);
    expect(settlements).toBe(1);

    const replay = await runtime.authorize(
      paidRequest(),
      paidEntrypoint,
      'invoke',
      requirement(runtime)
    );
    expect(replay.authorized).toBe(false);
    expect(verifies).toBe(1);
    expect(settlements).toBe(1);
  });

  it('projects EVM/x402 offer and header discovery', async () => {
    const runtime = await buildEvmRuntime(async () => ({
      reference: '0xdiscovery',
    }));

    expect(runtime.projectPayment(paidEntrypoint, 'invoke')).toMatchObject({
      parameters: expect.arrayContaining([
        { $ref: '#/components/parameters/PaymentSignature' },
      ]),
      'x-payment-info': {
        offers: [
          {
            amount: '1250000',
            currency,
            intent: 'charge',
            method: 'evm',
          },
        ],
      },
    });
    expect(runtime.openApiComponents()).toMatchObject({
      parameters: {
        PaymentSignature: {
          name: 'PAYMENT-SIGNATURE',
          in: 'header',
        },
      },
      headers: {
        PaymentRequired: expect.any(Object),
        PaymentResponse: expect.any(Object),
      },
    });
  });
});
