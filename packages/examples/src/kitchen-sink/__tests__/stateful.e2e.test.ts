import { catalog } from '@lucid-agents/catalog/node';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { wallets } from '@lucid-agents/wallet';
import { describe, expect, it } from 'bun:test';

import { createKitchenSinkAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

describe('kitchen-sink local state profiles E2E', () => {
  it('runs a due scheduler hire against the live agent exactly once', async () => {
    const runtime = await createKitchenSinkAgent();
    const agentApp = await createAgentApp(runtime);
    registerEntrypoints(agentApp.addEntrypoint, runtime);
    let echoInvocations = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        if (
          request.method === 'POST' &&
          new URL(request.url).pathname === '/entrypoints/echo/invoke'
        ) {
          echoInvocations += 1;
        }
        return agentApp.app.fetch(request);
      },
    });
    if (server.port === undefined) throw new Error('Missing agent port');
    const origin = `http://127.0.0.1:${server.port}`;

    try {
      await runtime.scheduler.createHire({
        agentCardUrl: `${origin}/.well-known/agent-card.json`,
        entrypointKey: 'echo',
        schedule: { kind: 'once', at: Date.now() },
        jobInput: { text: 'scheduled kitchen sink' },
        idempotencyKey: 'kitchen-sink-scheduler-once-0001',
      });
      await runtime.scheduler.tick({ workerId: 'kitchen-sink-worker' });
      await runtime.scheduler.tick({ workerId: 'kitchen-sink-worker' });

      expect(echoInvocations).toBe(1);
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });

  it('loads YAML and CSV catalogs and invokes their generated routes', async () => {
    const fixtures = [
      {
        file: `${import.meta.dir}/../fixtures/catalog.yaml`,
        key: 'yaml-widget',
      },
      { file: `${import.meta.dir}/../fixtures/catalog.csv`, key: 'csv-widget' },
    ];

    for (const fixture of fixtures) {
      const runtime = await createAgent({
        name: `catalog-${fixture.key}`,
        version: '1.0.0',
      })
        .use(http())
        .use(
          catalog({
            file: fixture.file,
            handlerFactory: item => async () => ({
              output: { key: item.key, format: item.metadata?.format },
            }),
          })
        )
        .build();
      const agentApp = await createAgentApp(runtime);
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: agentApp.app.fetch.bind(agentApp.app),
      });
      if (server.port === undefined) throw new Error('Missing catalog port');

      try {
        const response = await fetch(
          `http://127.0.0.1:${server.port}/entrypoints/${fixture.key}/invoke`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ input: { params: {} } }),
          }
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          output: { key: fixture.key },
        });
      } finally {
        server.stop(true);
        await runtime.close();
      }
    }
  });

  it('signs locally and serves identity trust plus an OASF record', async () => {
    const runtime = await createAgent({
      name: 'kitchen-sink-identity',
      version: '1.0.0',
      description: 'Local identity profile without external chain access',
    })
      .use(
        wallets({
          config: {
            agent: {
              type: 'local',
              privateKey: PRIVATE_KEY,
              caip2: 'eip155:31337',
            },
          },
        })
      )
      .use(
        identity({
          config: {
            trust: {
              trustModels: ['feedback'],
              feedbackDataUri: 'https://example.test/feedback.json',
            },
            registration: {
              selectedServices: ['OASF'],
              oasf: {
                authors: ['sdk@example.test'],
                skills: ['local-signing'],
                domains: ['testing'],
                modules: [],
                locators: [],
              },
            },
          },
        })
      )
      .use(http())
      .build();
    const wallet = runtime.wallets?.agent;
    if (!wallet) throw new Error('Missing local wallet');
    const signature = await wallet.connector.signChallenge({
      id: 'identity-e2e',
      payload: 'kitchen-sink-identity-proof',
      nonce: 'identity-e2e-nonce',
      issued_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-01T00:05:00.000Z',
    });
    expect(signature).toMatch(/^0x[0-9a-f]+$/i);

    const agentApp = await createAgentApp(runtime);
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: agentApp.app.fetch.bind(agentApp.app),
    });
    if (server.port === undefined) throw new Error('Missing identity port');
    const origin = `http://127.0.0.1:${server.port}`;

    try {
      const card = await fetch(`${origin}/.well-known/agent-card.json`);
      expect(await card.json()).toMatchObject({
        trustModels: ['feedback'],
        FeedbackDataURI: 'https://example.test/feedback.json',
      });
      const oasf = await fetch(`${origin}/.well-known/oasf-record.json`);
      expect(oasf.status).toBe(200);
      expect(await oasf.json()).toMatchObject({
        name: 'kitchen-sink-identity',
        domains: ['testing'],
      });
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });
});
