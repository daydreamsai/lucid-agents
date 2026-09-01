import { decodePaymentRequiredHeader } from '@x402/core/http';

import {
  createX402PaymentMethodsExample,
  type X402PaymentMethodsExampleOptions,
} from './x402';

export type DeterministicPaymentLane = 'evm' | 'solana';

export type DeterministicPaymentEvidence = {
  lane: DeterministicPaymentLane;
  network: string;
  challenged: boolean;
  signed: boolean;
  verified: boolean;
  settled: boolean;
  handlerSucceeded: boolean;
  receipt: string | null;
  signerCalls: number;
  broadcastCalls: number;
};

export type DeterministicPaymentRunnerOptions = {
  /** Build the merchant with local facilitator endpoints. */
  createExample: (
    facilitatorUrl: string
  ) => Promise<Awaited<ReturnType<typeof createX402PaymentMethodsExample>>>;
  /** Refuse before invoking the payer signer. */
  authorize: (lane: DeterministicPaymentLane) => boolean;
};

const networks: Record<DeterministicPaymentLane, string> = {
  evm: 'eip155:84532',
  solana: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

function paymentPayload(
  lane: DeterministicPaymentLane,
  challenge: ReturnType<typeof decodePaymentRequiredHeader>
) {
  if (!challenge) throw new Error('Missing x402 challenge');
  const accepted = challenge.accepts.find(
    offer => offer.network === networks[lane]
  );
  if (!accepted) throw new Error(`Challenge did not advertise ${lane}`);
  const identifier = `pay_${lane === 'evm' ? 'e' : 's'}0123456789abcdef`;
  const extensions = structuredClone(challenge.extensions ?? {});
  const declaration = extensions['payment-identifier'];
  if (declaration && typeof declaration === 'object') {
    extensions['payment-identifier'] = {
      ...declaration,
      info: {
        ...((declaration as { info?: Record<string, unknown> }).info ?? {}),
        id: identifier,
      },
    };
  }
  return {
    x402Version: challenge.x402Version,
    resource: challenge.resource,
    accepted,
    payload: {
      // The deterministic signer intentionally emits a stable marker instead
      // of private key material. The facilitator is the protocol boundary
      // under test and validates this payload in the same place as a real
      // signer-backed buyer.
      signature: `deterministic-${lane}-signature`,
      authorization: {
        from:
          lane === 'evm'
            ? '0x1234567890abcdef1234567890abcdef12345678'
            : '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
      },
    },
    extensions,
  };
}

/**
 * Run one exact x402 lane against an isolated local merchant/facilitator.
 *
 * The policy is evaluated before the signer boundary. A refusal therefore
 * cannot create a payment payload or reach facilitator settlement.
 */
export async function runDeterministicPaymentLane(
  lane: DeterministicPaymentLane,
  options: DeterministicPaymentRunnerOptions
): Promise<DeterministicPaymentEvidence> {
  let verifyCalls = 0;
  let settleCalls = 0;
  const facilitator = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/supported')) {
        return Response.json({
          kinds: [
            {
              x402Version: 2,
              scheme: 'exact',
              network: networks.evm,
              asset: {
                address: '0x0000000000000000000000000000000000000010',
                decimals: 6,
              },
            },
            {
              x402Version: 2,
              scheme: 'exact',
              network: networks.solana,
              asset: 'So11111111111111111111111111111111111111112',
              extra: {
                feePayer: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
              },
            },
          ],
          extensions: [],
          signers: {},
        });
      }
      if (path.endsWith('/verify')) {
        verifyCalls += 1;
        return Response.json({
          isValid: true,
          payer:
            lane === 'evm'
              ? '0x1234567890abcdef1234567890abcdef12345678'
              : '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
        });
      }
      if (path.endsWith('/settle')) {
        settleCalls += 1;
        return Response.json({
          success: true,
          payer:
            lane === 'evm'
              ? '0x1234567890abcdef1234567890abcdef12345678'
              : '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
          transaction: `0xdeterministic-${lane}`,
          network: networks[lane],
        });
      }
      return Response.json(
        { error: 'unexpected facilitator call' },
        { status: 500 }
      );
    },
  });
  if (facilitator.port === undefined)
    throw new Error('Missing facilitator port');

  const facilitatorUrl = `http://127.0.0.1:${facilitator.port}`;
  let example: Awaited<ReturnType<typeof options.createExample>> | undefined;
  let signerCalls = 0;
  let handlerSucceeded = false;
  try {
    const initializedExample = await options.createExample(facilitatorUrl);
    example = initializedExample;
    const invoke = (headers?: Record<string, string>) =>
      initializedExample.app.fetch(
        new Request('http://127.0.0.1/entrypoints/exact-report/invoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ input: { prompt: `proof-${lane}` } }),
        })
      );

    const challengeResponse = await invoke();
    if (challengeResponse.status !== 402) {
      throw new Error(
        `Expected 402 challenge, got ${challengeResponse.status}`
      );
    }
    const challengeHeader = challengeResponse.headers.get('PAYMENT-REQUIRED');
    if (!challengeHeader) throw new Error('Missing PAYMENT-REQUIRED challenge');
    const challenge = decodePaymentRequiredHeader(challengeHeader);
    if (!challenge) throw new Error('Missing PAYMENT-REQUIRED challenge');

    if (!options.authorize(lane)) {
      return {
        lane,
        network: networks[lane],
        challenged: true,
        signed: false,
        verified: false,
        settled: false,
        handlerSucceeded: false,
        receipt: null,
        signerCalls,
        broadcastCalls: settleCalls,
      };
    }

    signerCalls += 1;
    const paid = await invoke({
      'PAYMENT-SIGNATURE': Buffer.from(
        JSON.stringify(paymentPayload(lane, challenge))
      ).toString('base64'),
      'Idempotency-Key': `pay_${lane === 'evm' ? 'e' : 's'}0123456789abcdef`,
    });
    handlerSucceeded = paid.status === 200;
    return {
      lane,
      network: networks[lane],
      challenged: true,
      signed: true,
      verified: verifyCalls === 1,
      settled: settleCalls === 1,
      handlerSucceeded,
      receipt: paid.headers.get('PAYMENT-RESPONSE'),
      signerCalls,
      broadcastCalls: settleCalls,
    };
  } finally {
    try {
      await example?.close();
    } finally {
      facilitator.stop(true);
    }
  }
}

export function localDeterministicExampleOptions(
  facilitatorUrl: string
): X402PaymentMethodsExampleOptions {
  return {
    evm: {
      network: networks.evm as `eip155:${string}`,
      payTo: '0x1234567890abcdef1234567890abcdef12345678',
      asset: '0x0000000000000000000000000000000000000010',
      exactFacilitatorUrl: facilitatorUrl,
      uptoFacilitatorUrl: facilitatorUrl,
      batchFacilitatorUrl: facilitatorUrl,
    },
    solana: {
      network: networks.solana as `solana:${string}`,
      payTo: '7YttLkHDo2p6wM6o1HqCrM3k8wM4n1Rk2pQa8vZ6wabc',
      asset: 'So11111111111111111111111111111111111111112',
      facilitatorUrl,
    },
    siwxOrigin: 'http://127.0.0.1',
    batchSettlement: { mode: 'development' },
  };
}
