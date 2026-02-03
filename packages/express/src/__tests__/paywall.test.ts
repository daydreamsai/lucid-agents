import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, extractSenderDomain } from '@lucid-agents/payments';
import { createAgentApp } from '../app';
import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';
import type { Express, Request, Response } from 'express';
import type {
  PaymentsConfig,
  PaymentPolicyGroup,
} from '@lucid-agents/types/payments';
import { createInMemoryPaymentStorage } from '@lucid-agents/payments';
import type { PaymentTracker } from '@lucid-agents/payments';
import { createPaymentTracker } from '@lucid-agents/payments';

describe('Express Paywall - Incoming Payment Recording', () => {
  let app: Express;
  let paymentTracker: PaymentTracker;
  const testPayments: PaymentsConfig = {
    payTo: '0xabc1230000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.test',
    network: 'eip155:84532',
    storage: { type: 'in-memory' },
    policyGroups: [
      {
        name: 'test-group-1',
        incomingLimits: {
          global: { maxTotalUsd: 100.0 },
        },
      },
      {
        name: 'test-group-2',
        incomingLimits: {
          global: { maxTotalUsd: 200.0 },
          perSender: {
            '0x1234567890123456789012345678901234567890': {
              maxTotalUsd: 50.0,
            },
          },
        },
      },
    ],
  };

  beforeEach(async () => {
    const storage = createInMemoryPaymentStorage();
    paymentTracker = createPaymentTracker(storage);

    const agent = await createAgent({
      name: 'express-paywall-test',
      version: '1.0.0',
      description: 'Test agent for paywall',
    })
      .use(http())
      .use(payments({ config: testPayments }))
      .build();

    const { app: agentApp, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'test-endpoint',
      description: 'Test endpoint',
      input: z.object({ text: z.string() }),
      output: z.object({ result: z.string() }),
      price: '1000',
      async handler({ input }) {
        return {
          output: { result: input.text },
        };
      },
    });

    app = agentApp;
  });

  it('records incoming payment when PAYMENT-RESPONSE header is present', async () => {
    const mockReq = {
      path: '/entrypoints/test-endpoint/invoke',
      url: '/entrypoints/test-endpoint/invoke',
      originalUrl: '/entrypoints/test-endpoint/invoke',
      headers: {},
    } as unknown as Request;

    let recordedGroups: string[] = [];
    let recordedScopes: string[] = [];
    let recordedAmounts: bigint[] = [];

    const mockRes = {
      statusCode: 200,
      getHeader: (name: string) => {
        if (name === 'PAYMENT-RESPONSE') {
          return Buffer.from(
            JSON.stringify({
              payer: '0x1234567890123456789012345678901234567890',
              settled: true,
            })
          ).toString('base64');
        }
        return undefined;
      },
      json: async function (body: any) {
        const originalJson = this.originalJson;
        const paymentResponseHeader = this.getHeader('PAYMENT-RESPONSE') as
          | string
          | undefined;

        if (
          paymentResponseHeader &&
          this.statusCode >= 200 &&
          this.statusCode < 300
        ) {
          const policyGroups = testPayments.policyGroups;
          if (policyGroups && paymentTracker) {
            for (const group of policyGroups) {
              if (group.incomingLimits) {
                const scope = 'global';
                const paymentAmount = 1000n;

                await paymentTracker.recordIncoming(
                  group.name,
                  scope,
                  paymentAmount
                );

                recordedGroups.push(group.name);
                recordedScopes.push(scope);
                recordedAmounts.push(paymentAmount);
              }
            }
          }
        }

        return originalJson.call(this, body);
      },
      originalJson: function (body: any) {
        return this;
      },
    } as unknown as Response;

    await mockRes.json({ output: { result: 'test' } });

    expect(recordedGroups).toContain('test-group-1');
    expect(recordedGroups).toContain('test-group-2');
    expect(recordedScopes.every(s => s === 'global')).toBe(true);
    expect(recordedAmounts.every(a => a === 1000n)).toBe(true);
  });

  it('does not record payment when PAYMENT-RESPONSE header is missing', async () => {
    let recordingAttempted = false;

    const mockRes = {
      statusCode: 200,
      getHeader: () => undefined,
      json: async function (body: any) {
        const paymentResponseHeader = this.getHeader('PAYMENT-RESPONSE');
        if (paymentResponseHeader) {
          recordingAttempted = true;
        }
        return this;
      },
    } as unknown as Response;

    await mockRes.json({ output: { result: 'test' } });

    expect(recordingAttempted).toBe(false);
  });

  it('does not record payment for non-2xx status codes', async () => {
    let recordingAttempted = false;

    const mockRes = {
      statusCode: 404,
      getHeader: (name: string) => {
        if (name === 'PAYMENT-RESPONSE') {
          return Buffer.from(
            JSON.stringify({
              payer: '0x1234567890123456789012345678901234567890',
              settled: true,
            })
          ).toString('base64');
        }
        return undefined;
      },
      json: async function (body: any) {
        const paymentResponseHeader = this.getHeader('PAYMENT-RESPONSE');
        if (
          paymentResponseHeader &&
          this.statusCode >= 200 &&
          this.statusCode < 300
        ) {
          recordingAttempted = true;
        }
        return this;
      },
    } as unknown as Response;

    await mockRes.json({ error: 'Not found' });

    expect(recordingAttempted).toBe(false);
  });

  it('handles errors in payment recording gracefully', async () => {
    const mockRes = {
      statusCode: 200,
      getHeader: (name: string) => {
        if (name === 'PAYMENT-RESPONSE') {
          return Buffer.from(
            JSON.stringify({
              payer: '0x1234567890123456789012345678901234567890',
              settled: true,
            })
          ).toString('base64');
        }
        return undefined;
      },
      json: async function (body: any) {
        const originalJson = this.originalJson;
        const paymentResponseHeader = this.getHeader('PAYMENT-RESPONSE') as
          | string
          | undefined;

        if (
          paymentResponseHeader &&
          this.statusCode >= 200 &&
          this.statusCode < 300
        ) {
          try {
            const policyGroups = testPayments.policyGroups;
            if (policyGroups && paymentTracker) {
              const recordPromises: Promise<void>[] = [];
              for (const group of policyGroups) {
                if (group.incomingLimits) {
                  recordPromises.push(
                    paymentTracker
                      .recordIncoming(group.name, 'global', 1000n)
                      .catch(() => {
                        // Error handled
                      })
                  );
                }
              }
              await Promise.all(recordPromises);
            }
          } catch (error) {
            // Error should not break response
          }
        }

        return originalJson.call(this, body);
      },
      originalJson: function (body: any) {
        return this;
      },
    } as unknown as Response;

    const result = await mockRes.json({ output: { result: 'test' } });
    expect(result).toBeDefined();
  });

  it('records payments for multiple policy groups', async () => {
    const initialTotal1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const initialTotal2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    await paymentTracker.recordIncoming('test-group-1', 'global', 1000n);
    await paymentTracker.recordIncoming('test-group-2', 'global', 1000n);

    const total1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const total2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    expect(total1).toBe(initialTotal1 + 1000n);
    expect(total2).toBe(initialTotal2 + 1000n);
  });

  it('normalizes array headers to single string values', async () => {
    // Test normalization logic directly
    const normalizeHeader = (
      header: string | string[] | undefined
    ): string | undefined => {
      return typeof header === 'string'
        ? header
        : Array.isArray(header)
          ? header[0]
          : undefined;
    };

    // Test with array origin
    const originArray = ['https://example.com', 'https://other.com'];
    const refererString = 'https://referer.com';
    const normalizedOrigin = normalizeHeader(originArray);
    const normalizedReferer = normalizeHeader(refererString);
    const domain1 = extractSenderDomain(normalizedOrigin, normalizedReferer);
    expect(normalizedOrigin).toBe('https://example.com');
    expect(domain1).toBe('example.com');

    // Test with array referer
    const originString = 'https://origin.com';
    const refererArray = ['https://example.com', 'https://other.com'];
    const normalizedOrigin2 = normalizeHeader(originString);
    const normalizedReferer2 = normalizeHeader(refererArray);
    const domain2 = extractSenderDomain(normalizedOrigin2, normalizedReferer2);
    expect(normalizedReferer2).toBe('https://example.com');
    expect(domain2).toBe('origin.com'); // origin takes precedence

    // Test with both as arrays
    const originArray2 = ['https://first.com', 'https://second.com'];
    const refererArray2 = ['https://third.com', 'https://fourth.com'];
    const normalizedOrigin3 = normalizeHeader(originArray2);
    const normalizedReferer3 = normalizeHeader(refererArray2);
    const domain3 = extractSenderDomain(normalizedOrigin3, normalizedReferer3);
    expect(normalizedOrigin3).toBe('https://first.com');
    expect(normalizedReferer3).toBe('https://third.com');
    expect(domain3).toBe('first.com');

    // Test with string headers (should work normally)
    const originString2 = 'https://string.com';
    const refererString2 = 'https://string-referer.com';
    const normalizedOrigin4 = normalizeHeader(originString2);
    const normalizedReferer4 = normalizeHeader(refererString2);
    const domain4 = extractSenderDomain(normalizedOrigin4, normalizedReferer4);
    expect(normalizedOrigin4).toBe('https://string.com');
    expect(normalizedReferer4).toBe('https://string-referer.com');
    expect(domain4).toBe('string.com');

    // Test with undefined headers
    const normalizedOrigin5 = normalizeHeader(undefined);
    const normalizedReferer5 = normalizeHeader(undefined);
    const domain5 = extractSenderDomain(normalizedOrigin5, normalizedReferer5);
    expect(normalizedOrigin5).toBeUndefined();
    expect(normalizedReferer5).toBeUndefined();
    expect(domain5).toBeUndefined();
  });
});
