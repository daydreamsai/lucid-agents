import { describe, expect, it, beforeEach } from 'bun:test';
import express from 'express';
import type { Express } from 'express';
import { createInMemorySIWxStorage, type SIWxStorage } from '@lucid-agents/payments';
import type { AgentAuthContext, SIWxConfig } from '@lucid-agents/types/siwx';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig, PaymentsRuntime } from '@lucid-agents/types/payments';
import { withPayments, withSIWxAuthOnly } from '../paywall';

/**
 * Helper: encode a SIWX payload as a base64 header value.
 */
function encodeSIWxHeader(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Helper: create a valid SIWX payload for testing.
 */
function createSIWxPayload(overrides?: Record<string, unknown>) {
  return {
    domain: 'localhost',
    address: '0xABCD1234000000000000000000000000ABCD1234',
    uri: 'http://localhost/entrypoints/test/invoke',
    version: '1',
    chainId: 'eip155:84532',
    nonce: `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper: make an HTTP request to an Express app.
 */
async function request(
  app: Express,
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: unknown }
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = `http://127.0.0.1:${port}${path}`;

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'content-type': 'application/json',
          host: 'localhost',
          ...(options?.headers ?? {}),
        },
      };
      if (options?.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      fetch(url, fetchOptions)
        .then(async res => {
          const body = await res.json().catch(() => null);
          const headers: Record<string, string> = {};
          res.headers.forEach((v, k) => {
            headers[k] = v;
          });
          server.close();
          resolve({ status: res.status, headers, body });
        })
        .catch(err => {
          server.close();
          reject(err);
        });
    });
  });
}

/**
 * Create a minimal runtime-like object for tests.
 */
function createTestRuntime(opts: {
  siwxStorage: SIWxStorage;
  siwxConfig: SIWxConfig;
  payments?: Partial<PaymentsConfig>;
  entrypointSiwx?: EntrypointDef['siwx'];
}): {
  entrypoint: EntrypointDef;
  runtime: Partial<AgentRuntime>;
  payments: PaymentsConfig;
} {
  const payments: PaymentsConfig = {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.test',
    network: 'eip155:84532',
    ...(opts.payments ?? {}),
  };

  const entrypoint: EntrypointDef = {
    key: 'test',
    description: 'Test entrypoint',
    price: { invoke: '42' },
    siwx: opts.entrypointSiwx ?? { enabled: true },
  };

  const runtime: Partial<AgentRuntime> = {
    payments: {
      config: payments,
      isActive: true,
      requirements: () => [],
      siwxStorage: opts.siwxStorage,
      siwxConfig: opts.siwxConfig,
    } as unknown as PaymentsRuntime,
  };

  return { entrypoint, runtime, payments };
}

describe('SIWX Integration (Express)', () => {
  let siwxStorage: SIWxStorage;

  beforeEach(async () => {
    siwxStorage = createInMemorySIWxStorage();
  });

  describe('paid route with SIWX reuse', () => {
    it('should return 402 with SIWX extension for unpaid request', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';

      // Mock the x402 middleware to return 402
      const middlewareFactory = () => {
        return (_req: any, res: any, _next: any) => {
          // Simulate 402 response with JSON body
          res.status(402).json({
            error: 'payment_required',
            accepts: { scheme: 'exact', price: '42' },
          });
        };
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      // Add a handler at the end (should not be reached for 402)
      app.post(path, (_req, res) => {
        res.json({ output: 'success' });
      });

      const result = await request(app, 'POST', path, {
        body: { input: { text: 'hello' } },
      });

      expect(result.status).toBe(402);
      expect(result.body).toBeDefined();
      // Should have SIWX extension in the 402 response
      expect(result.body.extensions).toBeDefined();
      expect(result.body.extensions.siwx).toBeDefined();
      expect(result.body.extensions.siwx.scheme).toBe('sign-in-with-x');
      expect(result.body.extensions.siwx.domain).toBe('localhost');
      expect(result.body.extensions.siwx.uri).toBe(
        'http://localhost/entrypoints/test/invoke'
      );
    });

    it('should record entitlement after successful payment', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';
      const payerAddress = '0x1234567890123456789012345678901234567890';

      // Mock the x402 middleware that simulates successful payment
      const middlewareFactory = () => {
        return (_req: any, res: any, next: any) => {
          // Simulate payment settlement: set PAYMENT-RESPONSE header
          const paymentResponse = Buffer.from(
            JSON.stringify({ payer: payerAddress, settled: true })
          ).toString('base64');
          res.setHeader('PAYMENT-RESPONSE', paymentResponse);
          next();
        };
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      app.post(path, (_req, res) => {
        res.json({ output: 'success' });
      });

      const result = await request(app, 'POST', path, {
        body: { input: { text: 'hello' } },
      });

      expect(result.status).toBe(200);

      // Wait for async recording
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that entitlement was recorded
      const resourceUri = 'http://localhost/entrypoints/test/invoke';
      const hasPaid = await siwxStorage.hasPaid(
        resourceUri,
        payerAddress.toLowerCase()
      );
      expect(hasPaid).toBe(true);
    });

    it('should grant access via SIWX for entitled wallet', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';
      const walletAddress = '0xABCD1234000000000000000000000000ABCD1234';
      const resourceUri = 'http://localhost/entrypoints/test/invoke';

      // Pre-record entitlement
      await siwxStorage.recordPayment(
        resourceUri,
        walletAddress.toLowerCase()
      );

      // Mock x402 middleware that should NOT be reached
      let paymentMiddlewareReached = false;
      const middlewareFactory = () => {
        return (_req: any, _res: any, next: any) => {
          paymentMiddlewareReached = true;
          next();
        };
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      let capturedSiwxAuth: any = undefined;
      app.post(path, (req, res) => {
        capturedSiwxAuth = (req as any).siwxAuth;
        res.json({ output: 'success' });
      });

      const siwxPayload = createSIWxPayload({ address: walletAddress });
      const result = await request(app, 'POST', path, {
        headers: {
          'sign-in-with-x': encodeSIWxHeader(siwxPayload),
        },
        body: { input: { text: 'hello' } },
      });

      expect(result.status).toBe(200);
      expect(capturedSiwxAuth).toBeDefined();
      expect(capturedSiwxAuth.scheme).toBe('siwx');
      expect(capturedSiwxAuth.address).toBe(walletAddress.toLowerCase());
      expect(capturedSiwxAuth.grantedBy).toBe('entitlement');
    });

    it('should reject invalid SIWX header', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';

      const middlewareFactory = () => {
        return (_req: any, _res: any, next: any) => next();
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      app.post(path, (_req, res) => {
        res.json({ output: 'success' });
      });

      const result = await request(app, 'POST', path, {
        headers: {
          'sign-in-with-x': 'not-valid-base64!!!',
        },
        body: { input: { text: 'hello' } },
      });

      expect(result.status).toBe(401);
      expect(result.body.error.code).toBe('siwx_invalid');
    });
  });

  describe('auth-only route', () => {
    it('should return 401 when no SIWX header on auth-only route', async () => {
      const app = express();
      const path = '/entrypoints/auth-test/invoke';

      const entrypoint: EntrypointDef = {
        key: 'auth-test',
        description: 'Auth-only test',
        siwx: { authOnly: true },
      };

      const runtime: Partial<AgentRuntime> = {
        payments: {
          config: {} as PaymentsConfig,
          isActive: true,
          requirements: () => [],
          siwxStorage,
          siwxConfig: { enabled: true },
        } as unknown as PaymentsRuntime,
      };

      withSIWxAuthOnly({
        app,
        path,
        entrypoint,
        runtime: runtime as AgentRuntime,
      });

      app.post(path, (_req, res) => {
        res.json({ output: 'success' });
      });

      const result = await request(app, 'POST', path, {
        body: { input: {} },
      });

      expect(result.status).toBe(401);
      expect(result.body.error.code).toBe('siwx_required');
    });

    it('should grant access with valid SIWX on auth-only route', async () => {
      const app = express();
      const path = '/entrypoints/auth-test/invoke';

      const entrypoint: EntrypointDef = {
        key: 'auth-test',
        description: 'Auth-only test',
        siwx: { authOnly: true },
      };

      const runtime: Partial<AgentRuntime> = {
        payments: {
          config: {} as PaymentsConfig,
          isActive: true,
          requirements: () => [],
          siwxStorage,
          siwxConfig: { enabled: true },
        } as unknown as PaymentsRuntime,
      };

      withSIWxAuthOnly({
        app,
        path,
        entrypoint,
        runtime: runtime as AgentRuntime,
      });

      let capturedAuth: any = undefined;
      app.post(path, (req, res) => {
        capturedAuth = (req as any).siwxAuth;
        res.json({ output: 'success' });
      });

      const siwxPayload = createSIWxPayload({
        uri: 'http://localhost/entrypoints/auth-test/invoke',
      });
      const result = await request(app, 'POST', path, {
        headers: {
          'sign-in-with-x': encodeSIWxHeader(siwxPayload),
        },
        body: { input: {} },
      });

      expect(result.status).toBe(200);
      expect(capturedAuth).toBeDefined();
      expect(capturedAuth.scheme).toBe('siwx');
      expect(capturedAuth.grantedBy).toBe('auth-only');
    });
  });

  describe('handler auth context', () => {
    it('should provide req.siwxAuth on SIWX-authenticated request', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';
      const walletAddress = '0xABCD1234000000000000000000000000ABCD1234';
      const resourceUri = 'http://localhost/entrypoints/test/invoke';

      // Pre-record entitlement
      await siwxStorage.recordPayment(
        resourceUri,
        walletAddress.toLowerCase()
      );

      const middlewareFactory = () => {
        return (_req: any, _res: any, next: any) => next();
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      let authContext: AgentAuthContext | undefined;
      app.post(path, (req, res) => {
        authContext = (req as any).siwxAuth;
        res.json({ output: 'success' });
      });

      const siwxPayload = createSIWxPayload({ address: walletAddress });
      await request(app, 'POST', path, {
        headers: {
          'sign-in-with-x': encodeSIWxHeader(siwxPayload),
        },
        body: { input: { text: 'hello' } },
      });

      expect(authContext).toBeDefined();
      expect(authContext!.scheme).toBe('siwx');
      expect(authContext!.address).toBe(walletAddress.toLowerCase());
      expect(authContext!.chainId).toBe('eip155:84532');
      expect(authContext!.grantedBy).toBe('entitlement');
      expect(authContext!.payload).toBeDefined();
    });

    it('should not provide req.siwxAuth on non-SIWX request', async () => {
      const { entrypoint, runtime, payments } = createTestRuntime({
        siwxStorage,
        siwxConfig: { enabled: true },
      });

      const app = express();
      const path = '/entrypoints/test/invoke';

      // Mock x402 middleware that just passes through
      const middlewareFactory = () => {
        return (_req: any, _res: any, next: any) => next();
      };

      withPayments({
        app,
        path,
        entrypoint,
        kind: 'invoke',
        payments,
        runtime: runtime as AgentRuntime,
        middlewareFactory: middlewareFactory as any,
      });

      let authContext: any = 'not-set';
      app.post(path, (req, res) => {
        authContext = (req as any).siwxAuth;
        res.json({ output: 'success' });
      });

      await request(app, 'POST', path, {
        body: { input: { text: 'hello' } },
      });

      expect(authContext).toBeUndefined();
    });
  });
});
