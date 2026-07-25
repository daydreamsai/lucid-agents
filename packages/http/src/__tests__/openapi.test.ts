import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
  buildOpenApiDocument,
  projectX402OpenApiPayment,
} from '../openapi';

describe('canonical OpenAPI discovery', () => {
  it('merges protocol-owned payment discovery without losing typed schemas', () => {
    const path = '/api/agent/entrypoints/quote/invoke';
    const document = buildOpenApiDocument({
      title: 'Quote agent',
      version: '1.0.0',
      description: 'Typed paid quote service',
      basePath: '/api/agent',
      entrypoints: [
        {
          key: 'quote',
          price: '0.01',
          input: z.object({ symbol: z.string() }),
          output: z.object({ price: z.number() }),
          handler: async () => ({ output: { price: 1 } }),
        },
      ],
      projectPayment: () => ({
        requestBody: {
          content: { 'application/json': { schema: {} } },
        },
        'x-payment-info': {
          offers: [
            {
              method: 'tempo',
              intent: 'charge',
              amount: '10000',
              currency: '0x20c0000000000000000000000000000000000000',
            },
          ],
        },
      }),
      paymentComponents: {
        securitySchemes: {
          Payment: {
            type: 'http',
            scheme: 'Payment',
          },
        },
      },
    }) as {
      info: { description?: string };
      paths: Record<
        string,
        {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { properties?: Record<string, unknown> };
                };
              };
            };
            'x-payment-info': { offers: unknown[] };
          };
        }
      >;
    };

    expect(document.info.description).toBe('Typed paid quote service');
    expect(
      document.paths[path]?.post.requestBody.content['application/json'].schema
        .properties?.symbol
    ).toBeDefined();
    expect(document.paths[path]?.post['x-payment-info'].offers).toHaveLength(1);
  });

  it('does not advertise payment failures for a free operation', () => {
    const path = '/entrypoints/ping/invoke';
    const document = buildOpenApiDocument({
      title: 'Free agent',
      version: '1.0.0',
      basePath: '',
      entrypoints: [
        {
          key: 'ping',
          handler: async () => ({ output: { ok: true } }),
        },
      ],
    }) as {
      paths: Record<string, { post: { responses: Record<string, unknown> } }>;
    };

    expect(document.paths[path]?.post.responses['200']).toBeDefined();
    expect(document.paths[path]?.post.responses['402']).toBeUndefined();
  });

  it('uses x402 response headers and preserves official extension discovery', () => {
    const path = '/entrypoints/paid/invoke';
    const document = buildOpenApiDocument({
      title: 'x402 agent',
      version: '1.0.0',
      basePath: '',
      entrypoints: [
        {
          key: 'paid',
          x402: {
            offers: [
              {
                scheme: 'exact',
                network: 'eip155:84532',
                price: '1000',
                payTo: '0x0000000000000000000000000000000000000001',
              },
            ],
          },
          handler: async () => ({ output: { ok: true } }),
        },
      ],
      projectPayment: () =>
        projectX402OpenApiPayment({
          entrypointKey: 'paid',
          kind: 'invoke',
          offers: [
            {
              scheme: 'exact',
              network: 'eip155:84532',
              price: '1000',
              payTo: '0x0000000000000000000000000000000000000001',
            },
          ],
          extensions: {
            bazaar: { info: { input: { type: 'http' } } },
          },
        }),
    }) as {
      paths: Record<
        string,
        {
          post: {
            responses: {
              '402': { headers: Record<string, unknown> };
            };
            'x-x402-payment': { extensions: Record<string, unknown> };
          };
        }
      >;
    };

    const operation = document.paths[path]!.post;
    expect(operation.responses['402'].headers['PAYMENT-REQUIRED']).toBeDefined();
    expect(operation.responses['402'].headers['WWW-Authenticate']).toBeUndefined();
    expect(operation['x-x402-payment'].extensions.bazaar).toBeDefined();
  });
});
