import { describe, expect, it } from 'bun:test';

import {
  localDeterministicExampleOptions,
  runDeterministicPaymentLane,
} from '../payment-methods/e2e-runner';
import { createX402PaymentMethodsExample } from '../payment-methods/x402';

describe('deterministic exact payment runner', () => {
  it.each(['evm', 'solana'] as const)(
    'completes the %s challenge, signed credential, settlement, and receipt flow',
    async lane => {
      const evidence = await runDeterministicPaymentLane(lane, {
        createExample: facilitatorUrl =>
          createX402PaymentMethodsExample(
            localDeterministicExampleOptions(facilitatorUrl)
          ),
        authorize: () => true,
      });

      expect(evidence).toMatchObject({
        lane,
        challenged: true,
        signed: true,
        verified: true,
        settled: true,
        handlerSucceeded: true,
        signerCalls: 1,
        broadcastCalls: 1,
      });
      expect(evidence.receipt).toBeTruthy();
    }
  );

  it.each(['evm', 'solana'] as const)(
    'refuses %s before signing or broadcast',
    async lane => {
      const evidence = await runDeterministicPaymentLane(lane, {
        createExample: facilitatorUrl =>
          createX402PaymentMethodsExample(
            localDeterministicExampleOptions(facilitatorUrl)
          ),
        authorize: () => false,
      });

      expect(evidence).toEqual({
        lane,
        network:
          lane === 'evm'
            ? 'eip155:84532'
            : 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        challenged: true,
        signed: false,
        verified: false,
        settled: false,
        handlerSucceeded: false,
        receipt: null,
        signerCalls: 0,
        broadcastCalls: 0,
      });
    }
  );

  it('stops the local facilitator when example initialization fails', async () => {
    let facilitatorUrl = '';
    await expect(
      runDeterministicPaymentLane('evm', {
        createExample: url => {
          facilitatorUrl = url;
          throw new Error('merchant initialization failed');
        },
        authorize: () => true,
      })
    ).rejects.toThrow('merchant initialization failed');

    await expect(fetch(`${facilitatorUrl}/supported`)).rejects.toThrow();
  });
});
