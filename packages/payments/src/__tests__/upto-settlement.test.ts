import { afterEach, describe, expect, it } from 'bun:test';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  IncomingPaymentAdmission,
  PaymentsConfig,
} from '@lucid-agents/types/payments';
import { decodePaymentRequiredHeader } from '@x402/core/http';

import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createPaymentsRuntime } from '../payments';

const NETWORK = 'eip155:84532';
const PAY_TO = '0x1234567890abcdef1234567890abcdef12345678';
const ASSET = '0x0000000000000000000000000000000000000010';
const PAYER = '0x0000000000000000000000000000000000000020';
const originalFetch = globalThis.fetch;

const entrypoint: EntrypointDef = {
  key: 'metered',
  paymentProtocol: 'x402',
  x402: {
    offers: [
      {
        scheme: 'upto',
        network: NETWORK,
        maximum: '$0.001',
      },
    ],
  },
};

type FacilitatorHarness = {
  settlements: Array<Record<string, unknown>>;
  failSettlement: boolean;
};

function installFacilitator(
  options: { omitAddress?: boolean } = {}
): FacilitatorHarness {
  const harness: FacilitatorHarness = {
    settlements: [],
    failSettlement: false,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path.endsWith('/supported')) {
      return Response.json({
        kinds: [
          {
            x402Version: 2,
            scheme: 'upto',
            network: NETWORK,
            extra: {
              assetTransferMethod: 'permit2',
              ...(options.omitAddress
                ? {}
                : {
                    facilitatorAddress:
                      '0x0000000000000000000000000000000000000001',
                  }),
            },
            asset: {
              address: ASSET,
              decimals: 6,
              eip712: { name: 'USDC', version: '2' },
            },
          },
        ],
        extensions: [],
        signers: {},
      });
    }
    if (path.endsWith('/verify')) {
      return Response.json({ isValid: true, payer: PAYER });
    }
    if (path.endsWith('/settle')) {
      const body = (await request.json()) as Record<string, unknown>;
      harness.settlements.push(body);
      if (harness.failSettlement) {
        return Response.json({
          success: false,
          errorReason: 'facilitator_rejected',
          transaction: '',
          network: NETWORK,
        });
      }
      const requirements = body.paymentRequirements as {
        amount: string;
      };
      return Response.json({
        success: true,
        payer: PAYER,
        transaction: `0x${'12'.repeat(32)}`,
        network: NETWORK,
        amount: requirements.amount,
      });
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  }) as typeof globalThis.fetch;
  return harness;
}

function request(paymentSignature?: string): Request {
  return new Request('https://agent.example.com/entrypoints/metered/invoke', {
    method: 'POST',
    headers: paymentSignature
      ? { 'PAYMENT-SIGNATURE': paymentSignature }
      : undefined,
  });
}

function signatureFromChallenge(response: Response): string {
  const encoded = response.headers.get('PAYMENT-REQUIRED');
  if (!encoded) throw new Error('Missing PAYMENT-REQUIRED');
  const required = decodePaymentRequiredHeader(encoded);
  return Buffer.from(
    JSON.stringify({
      x402Version: required.x402Version,
      resource: required.resource,
      accepted: required.accepts[0],
      payload: { permit2Authorization: 'test' },
    })
  ).toString('base64');
}

async function authorizeAdmission(
  runtime: NonNullable<ReturnType<typeof createPaymentsRuntime>>
): Promise<Extract<IncomingPaymentAdmission, { admitted: true }>> {
  const challenge = await runtime.authorize(request(), entrypoint, 'invoke');
  if (challenge.authorized) throw new Error('Expected challenge');
  const authorization = await runtime.authorize(
    request(signatureFromChallenge(challenge.response)),
    entrypoint,
    'invoke'
  );
  if (!authorization.authorized) throw new Error('Expected authorization');
  const admission = await authorization.admit();
  if (!admission.admitted) {
    throw new Error(
      `Expected admission, received ${admission.response.status}`
    );
  }
  return admission;
}

function configWithLimit(maxTotalUsd = 0.01): PaymentsConfig {
  return {
    facilitatorUrl: 'https://facilitator.example',
    network: NETWORK,
    payTo: PAY_TO,
    policyGroups: [
      {
        name: 'metered-total',
        incomingLimits: { global: { maxTotalUsd } },
      },
    ],
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('x402 upto settlement', () => {
  it('rejects a facilitator that cannot advertise its Permit2 address', async () => {
    installFacilitator({ omitAddress: true });
    const runtime = createPaymentsRuntime(configWithLimit())!;
    const challenge = await runtime.authorize(request(), entrypoint, 'invoke');

    expect(challenge.authorized).toBe(false);
    if (challenge.authorized) throw new Error('Expected rejection');
    expect(challenge.response.status).toBe(503);
    expect(await challenge.response.json()).toMatchObject({
      error: {
        code: 'payment_configuration_error',
        message: expect.stringContaining('do not support'),
      },
    });
    await runtime.close();
  });

  it.each([
    ['zero', '0'],
    ['partial', '250'],
    ['ceiling', '1000'],
  ])('settles and accounts the %s actual amount', async (_name, amount) => {
    const facilitator = installFacilitator();
    const storage = createInMemoryPaymentStorage();
    const runtime = createPaymentsRuntime(
      configWithLimit(),
      undefined,
      () => storage
    )!;
    const admission = await authorizeAdmission(runtime);

    const response = await admission.finalize(new Response('ok'), {
      payment: { actualAmount: amount },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
    expect(facilitator.settlements).toHaveLength(1);
    expect(
      (
        facilitator.settlements[0]!.paymentRequirements as {
          amount: string;
        }
      ).amount
    ).toBe(amount);
    expect(
      await runtime.paymentTracker?.getIncomingTotal('metered-total', 'global')
    ).toBe(BigInt(amount));
    await runtime.close();
  });

  it('rejects missing, negative, and over-ceiling handler amounts without settling', async () => {
    const facilitator = installFacilitator();
    for (const payment of [
      undefined,
      { actualAmount: '-1' },
      { actualAmount: '1001' },
    ]) {
      const runtime = createPaymentsRuntime(configWithLimit())!;
      const admission = await authorizeAdmission(runtime);
      const response = await admission.finalize(new Response('ok'), {
        ...(payment ? { payment } : {}),
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        error: { code: 'invalid_payment_settlement' },
      });
      await runtime.close();
    }
    expect(facilitator.settlements).toHaveLength(0);
  });

  it('releases the ceiling on handler and settlement failure', async () => {
    const facilitator = installFacilitator();
    const runtime = createPaymentsRuntime(configWithLimit(0.001))!;

    const handlerFailure = await authorizeAdmission(runtime);
    expect(
      (await handlerFailure.finalize(new Response('failed', { status: 500 })))
        .status
    ).toBe(500);

    facilitator.failSettlement = true;
    const settlementFailure = await authorizeAdmission(runtime);
    expect(
      (
        await settlementFailure.finalize(new Response('ok'), {
          payment: { actualAmount: '100' },
        })
      ).status
    ).toBe(402);
    expect(
      await runtime.paymentTracker?.getIncomingTotal('metered-total', 'global')
    ).toBe(0n);
    await runtime.close();
  });

  it('keeps actual accounting and receipts stable for committed response recovery', async () => {
    installFacilitator();
    const runtime = createPaymentsRuntime(configWithLimit())!;
    const admission = await authorizeAdmission(runtime);
    const settled = await admission.finalize(new Response('ok'), {
      payment: { actualAmount: '125' },
    });
    const recovered = admission.recoverCommittedResponse?.(
      Response.json({ replay: true })
    );

    expect(admission.isCommitted?.()).toBe(true);
    expect(recovered?.headers.get('PAYMENT-RESPONSE')).toBe(
      settled.headers.get('PAYMENT-RESPONSE')
    );
    expect(
      await runtime.paymentTracker?.getIncomingTotal('metered-total', 'global')
    ).toBe(125n);
    await runtime.close();
  });

  it('reserves ceilings concurrently, then atomically releases unused capacity', async () => {
    installFacilitator();
    const runtime = createPaymentsRuntime(configWithLimit(0.0015))!;
    const first = await authorizeAdmission(runtime);

    const challenge = await runtime.authorize(request(), entrypoint, 'invoke');
    if (challenge.authorized) throw new Error('Expected challenge');
    const blockedAuthorization = await runtime.authorize(
      request(signatureFromChallenge(challenge.response)),
      entrypoint,
      'invoke'
    );
    expect(blockedAuthorization.authorized).toBe(true);
    if (!blockedAuthorization.authorized) throw new Error('Expected verified');
    const blocked = await blockedAuthorization.admit();
    expect(blocked.admitted).toBe(false);

    expect(
      (
        await first.finalize(new Response('ok'), {
          payment: { actualAmount: '100' },
        })
      ).status
    ).toBe(200);
    const afterRelease = await authorizeAdmission(runtime);
    await afterRelease.abort();
    await runtime.close();
  });
});
