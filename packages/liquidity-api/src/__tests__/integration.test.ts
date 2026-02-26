import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';
import type { Hono } from 'hono';

describe('Integration Tests', () => {
  let app: Hono;
  let server: any;
  const port = 13001;
  const baseUrl = `http://localhost:${port}`;

  beforeAll(async () => {
    const agent = await createAgent({
      name: 'liquidity-api-test',
      version: '0.1.0',
      description: 'Test agent for liquidity API',
    })
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            network: 'eip155:84532',
            facilitatorUrl: 'https://facilitator.daydreams.systems',
          },
        })
      )
      .build();

    const result = await createAgentApp(agent);
    app = result.app;

    const { registerEntrypoints } = await import('../index');
    await registerEntrypoints(result.addEntrypoint);

    server = Bun.serve({
      port,
      fetch: app.fetch,
    });
  });

  afterAll(() => {
    if (server) server.stop();
  });

  describe('Manifest', () => {
    test('should expose agent manifest', async () => {
      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      expect(response.status).toBe(200);

      const manifest = await response.json();
      expect(manifest.name).toBe('liquidity-api-test');
      expect(manifest.version).toBe('0.1.0');
      // Entrypoints is an object, not array
      expect(manifest.entrypoints).toBeDefined();
      expect(typeof manifest.entrypoints).toBe('object');
    });
  });

  describe('Entrypoints', () => {
    test('should have snapshot entrypoint', async () => {
      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      const manifest = await response.json();
      expect(manifest.entrypoints.snapshot).toBeDefined();
      expect(manifest.entrypoints.snapshot.pricing.invoke).toBe('0.10');
    });

    test('should have slippage entrypoint', async () => {
      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      const manifest = await response.json();
      expect(manifest.entrypoints.slippage).toBeDefined();
      expect(manifest.entrypoints.slippage.pricing.invoke).toBe('0.15');
    });

    test('should have routes entrypoint', async () => {
      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      const manifest = await response.json();
      expect(manifest.entrypoints.routes).toBeDefined();
      expect(manifest.entrypoints.routes.pricing.invoke).toBe('0.20');
    });
  });

  describe('Payment Required (x402)', () => {
    test('snapshot endpoint should require payment', async () => {
      const response = await fetch(`${baseUrl}/entrypoints/snapshot/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'ethereum',
          baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        }),
      });
      expect(response.status).toBe(402);
    });

    test('slippage endpoint should require payment', async () => {
      const response = await fetch(`${baseUrl}/entrypoints/slippage/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'ethereum',
          baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          notionalUsd: 10000,
        }),
      });
      expect(response.status).toBe(402);
    });

    test('routes endpoint should require payment', async () => {
      const response = await fetch(`${baseUrl}/entrypoints/routes/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'ethereum',
          baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          notionalUsd: 25000,
        }),
      });
      expect(response.status).toBe(402);
    });
  });

  describe('Response Format', () => {
    test('manifest should include freshness in description', async () => {
      const response = await fetch(`${baseUrl}/.well-known/agent.json`);
      const manifest = await response.json();
      expect(manifest.entrypoints.snapshot.description).toContain('freshness');
    });
  });
});
