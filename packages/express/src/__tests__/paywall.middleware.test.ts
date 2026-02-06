import { withPayments } from '../paywall';
import { describe, expect, it } from 'bun:test';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

describe('withPayments middleware registration', () => {
  const payments: PaymentsConfig = {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.daydreams.systems',
    network: 'eip155:84532',
  };

  const entrypoint: EntrypointDef = {
    key: 'test',
    price: { invoke: '42' },
  };

  it('registers EVM exact scheme for x402 middleware', () => {
    const calls: any[][] = [];
    let capturedSchemes: any[] | null = null;

    const app = {
      use: (...args: any[]) => calls.push(args),
    };

    const middlewareFactory = (
      _routes: Record<string, unknown>,
      _facilitatorClient: unknown,
      schemes?: any[]
    ) => {
      capturedSchemes = schemes ?? null;
      return (_req: unknown, _res: unknown, next: () => void) => next();
    };

    const didRegister = withPayments({
      app: app as any,
      path: '/entrypoints/test/invoke',
      entrypoint,
      kind: 'invoke',
      payments,
      middlewareFactory: middlewareFactory as any,
    });

    expect(didRegister).toBe(true);
    expect(calls.length).toBe(1);
    expect(capturedSchemes).toBeTruthy();
    expect(capturedSchemes?.length).toBe(1);
    expect(capturedSchemes?.[0]?.network).toBe('eip155:*');
    expect(capturedSchemes?.[0]?.server?.scheme).toBe('exact');
  });
});
