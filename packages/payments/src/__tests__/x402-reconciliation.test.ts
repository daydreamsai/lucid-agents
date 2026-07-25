import { describe, expect, it } from 'bun:test';
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http';
import type { PaymentPayload } from '@x402/core/types';
import { BAZAAR, validateDiscoveryExtension } from '@x402/extensions/bazaar';
import {
  PAYMENT_IDENTIFIER,
  appendPaymentIdentifierToExtensions,
} from '@x402/extensions/payment-identifier';
import {
  extractOffersFromPaymentRequired,
  extractReceiptFromResponse,
  type OfferReceiptIssuer,
} from '@x402/extensions/offer-receipt';
import { z } from 'zod';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { createIncomingPaymentAuthorizer } from '../incoming';
import {
  projectX402Payment,
  reconcilePaymentIdentifier,
  type X402ReconciliationOptions,
} from '../x402-reconciliation';

const config: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
};

const entrypoint: EntrypointDef = {
  key: 'quote',
  description: 'Return a market quote',
  price: '0.01',
  input: z.object({ symbol: z.string() }),
  output: z.object({ price: z.number() }),
};

function paymentPayload(identifier?: string): PaymentPayload {
  const extensions: Record<string, unknown> = {
    [PAYMENT_IDENTIFIER]: {
      info: { required: true },
      schema: {},
    },
  };
  appendPaymentIdentifierToExtensions(extensions, identifier);
  return {
    x402Version: 2,
    resource: { url: 'https://agent.example.com/quote' },
    accepted: {
      scheme: 'exact',
      network: 'eip155:84532',
      asset: '0x0000000000000000000000000000000000000001',
      amount: '1000',
      payTo: '0x1234567890abcdef1234567890abcdef12345678',
      maxTimeoutSeconds: 300,
      extra: {},
    },
    payload: {},
    extensions,
  };
}

describe('x402 reconciliation extensions', () => {
  it('correlates the official payment identifier with Idempotency-Key', () => {
    const identifier = 'pay_1234567890abcdef';
    const request = new Request('https://agent.example.com/quote', {
      headers: {
        'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(
          paymentPayload(identifier)
        ),
        'Idempotency-Key': identifier,
      },
    });

    const result = reconcilePaymentIdentifier(request, true);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected reconciliation');
    expect(result.metadata?.paymentIdentifier).toBe(identifier);
    expect(result.metadata?.extensions[PAYMENT_IDENTIFIER]).toBeDefined();
  });

  it('rejects identifier mismatch before contacting a facilitator', async () => {
    const originalFetch = globalThis.fetch;
    let facilitatorCalls = 0;
    globalThis.fetch = (async () => {
      facilitatorCalls += 1;
      throw new Error('facilitator should not be contacted');
    }) as unknown as typeof fetch;
    const authorizer = createIncomingPaymentAuthorizer(config, {
      reconciliation: { paymentIdentifier: { required: true } },
    });

    try {
      const result = await authorizer(
        new Request('https://agent.example.com/quote', {
          method: 'POST',
          headers: {
            'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(
              paymentPayload('pay_1234567890abcdef')
            ),
            'Idempotency-Key': 'pay_fedcba0987654321',
          },
        }),
        entrypoint,
        'invoke'
      );

      expect(result.authorized).toBe(false);
      if (result.authorized) throw new Error('Expected mismatch');
      expect(result.response.status).toBe(400);
      expect(await result.response.json()).toEqual({
        error: {
          code: 'payment_identifier_mismatch',
          message: 'The payment identifier must equal Idempotency-Key.',
        },
      });
      expect(facilitatorCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('projects canonical entrypoint schemas through official Bazaar metadata', () => {
    const projection = projectX402Payment(entrypoint, 'invoke', config, {
      paymentIdentifier: { required: true },
      bazaar: { enabled: true },
    });

    expect(projection?.description).toBe('Return a market quote');
    expect(projection?.offers).toHaveLength(1);
    expect(projection?.extensions[PAYMENT_IDENTIFIER]).toBeDefined();
    const bazaar = projection?.extensions[BAZAAR.key];
    expect(validateDiscoveryExtension(bazaar as never).valid).toBe(true);
    expect(
      (bazaar as { info: { input: { body: Record<string, unknown> } } }).info
        .input.body
    ).toEqual({ input: { symbol: '' } });
  });

  it('advertises Payment Identifier only for invoke replay semantics', () => {
    const options: X402ReconciliationOptions = {
      paymentIdentifier: { required: true },
      bazaar: { enabled: true },
    };

    const invoke = projectX402Payment(entrypoint, 'invoke', config, options);
    const stream = projectX402Payment(entrypoint, 'stream', config, options);
    const task = projectX402Payment(entrypoint, 'task', config, options);

    expect(invoke?.extensions[PAYMENT_IDENTIFIER]).toBeDefined();
    expect(stream?.extensions[PAYMENT_IDENTIFIER]).toBeUndefined();
    expect(task?.extensions[PAYMENT_IDENTIFIER]).toBeUndefined();
    expect(stream?.extensions[BAZAAR.key]).toBeDefined();
    expect(task?.extensions[BAZAAR.key]).toBeDefined();
  });

  it('declares signed offers without exposing the injected issuer', () => {
    const issuer: OfferReceiptIssuer = {
      kid: 'did:web:agent.example.com#payments',
      format: 'jws',
      issueOffer: async () => ({
        format: 'jws',
        signature: 'header.payload.signature',
      }),
      issueReceipt: async () => ({
        format: 'jws',
        signature: 'header.payload.signature',
      }),
    };
    const options: X402ReconciliationOptions = {
      offerReceipt: {
        issuer,
        includeTxHash: false,
        offerValiditySeconds: 120,
      },
    };

    const projection = projectX402Payment(
      entrypoint,
      'invoke',
      config,
      options
    );

    expect(JSON.stringify(projection)).not.toContain('issueOffer');
    expect(JSON.stringify(projection)).not.toContain('did:web');
    expect(projection?.extensions['offer-receipt']).toEqual({
      includeTxHash: false,
      offerValiditySeconds: 120,
    });
  });

  it('exposes a verified identifier without promoting it to caller identity', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async input => {
      const path = new URL(
        typeof input === 'string' ? input : new Request(input).url
      ).pathname;
      if (path.endsWith('/supported')) {
        return Response.json({
          kinds: [
            {
              x402Version: 2,
              scheme: 'exact',
              network: 'eip155:84532',
              asset: {
                address: '0x0000000000000000000000000000000000000001',
                decimals: 6,
              },
              extra: {},
            },
          ],
          extensions: [],
          signers: {},
        });
      }
      if (path.endsWith('/verify')) {
        return Response.json({
          isValid: true,
          payer: '0x9999999999999999999999999999999999999999',
        });
      }
      if (path.endsWith('/settle')) {
        return Response.json({
          success: true,
          payer: '0x9999999999999999999999999999999999999999',
          network: 'eip155:84532',
          transaction: '0xreceipt',
        });
      }
      throw new Error(`Unexpected facilitator path: ${path}`);
    }) as typeof fetch;
    const identifier = 'pay_verified_12345678';
    const issuer: OfferReceiptIssuer = {
      kid: 'did:web:agent.example.com#payments',
      format: 'jws',
      issueOffer: async () => ({
        format: 'jws',
        signature: 'offer.payload.signature',
      }),
      issueReceipt: async () => ({
        format: 'jws',
        signature: 'receipt.payload.signature',
      }),
    };
    const authorizer = createIncomingPaymentAuthorizer(config, {
      reconciliation: {
        paymentIdentifier: { required: true },
        offerReceipt: { issuer },
      },
    });

    try {
      const unpaid = await authorizer(
        new Request('https://agent.example.com/quote', { method: 'POST' }),
        entrypoint,
        'invoke'
      );
      if (unpaid.authorized) throw new Error('Expected challenge');
      const required = decodePaymentRequiredHeader(
        unpaid.response.headers.get('PAYMENT-REQUIRED')!
      );
      expect(extractOffersFromPaymentRequired(required)).toHaveLength(1);
      appendPaymentIdentifierToExtensions(
        required.extensions ?? {},
        identifier
      );
      const payload: PaymentPayload = {
        x402Version: 2,
        resource: required.resource,
        accepted: required.accepts[0]!,
        payload: { signature: 'test' },
        extensions: required.extensions,
      };
      const authorized = await authorizer(
        new Request('https://agent.example.com/quote', {
          method: 'POST',
          headers: {
            'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload),
            'Idempotency-Key': identifier,
          },
        }),
        entrypoint,
        'invoke'
      );

      expect(authorized.authorized).toBe(true);
      if (!authorized.authorized) throw new Error('Expected authorization');
      expect(authorized.reconciliation?.paymentIdentifier).toBe(identifier);
      expect(authorized.subject).toBe(
        'payment:eip155:84532:0x9999999999999999999999999999999999999999'
      );
      expect(authorized.subject).not.toContain(identifier);
      const admission = await authorized.admit();
      if (!admission.admitted) throw new Error('Expected admission');
      const settled = await admission.finalize(Response.json({ ok: true }));
      expect(extractReceiptFromResponse(settled)).toEqual({
        format: 'jws',
        signature: 'receipt.payload.signature',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
