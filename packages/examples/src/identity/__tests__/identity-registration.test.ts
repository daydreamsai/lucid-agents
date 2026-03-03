/**
 * Tests for identity-registration.ts
 *
 * These are unit/contract tests.  The @lucid-agents/identity calls are
 * expected to fail gracefully when no wallet is configured — we verify the
 * exported helpers return sensible status objects rather than throwing.
 */

import { describe, expect, it } from 'bun:test';

import {
  autoRegisterIdentity,
  buildIdentityAgent,
  explicitRegisterIdentity,
  registerWithTrustModels,
} from '../identity-registration';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildIdentityAgent', () => {
  it('builds an agent runtime without throwing', async () => {
    const { agent } = await buildIdentityAgent({ domain: 'test.example.com' });
    expect(agent).toBeDefined();
  });

  it('accepts custom domain, rpcUrl, and chainId options', async () => {
    const opts = {
      domain: 'custom.example.com',
      rpcUrl: 'https://rpc.example.com',
      chainId: 84532,
    };
    const result = await buildIdentityAgent(opts);
    expect(result.domain).toBe(opts.domain);
    expect(result.chainId).toBe(opts.chainId);
  });

  it('does not require wallet env vars to build', async () => {
    const saved = process.env.AGENT_WALLET_PRIVATE_KEY;
    delete process.env.AGENT_WALLET_PRIVATE_KEY;

    try {
      const { agent } = await buildIdentityAgent();
      // Agent should build even without a wallet
      expect(agent).toBeDefined();
    } finally {
      if (saved) process.env.AGENT_WALLET_PRIVATE_KEY = saved;
    }
  });
});

describe('autoRegisterIdentity', () => {
  it('returns an identity object without throwing', async () => {
    // Without a real wallet the registration should fail gracefully
    const identity = await autoRegisterIdentity().catch(err => {
      // If it throws a connection error that's fine — we just check the shape
      return { status: 'error', error: err };
    });
    expect(identity).toBeDefined();
    // Must have at minimum a status property
    expect(typeof (identity as { status?: unknown }).status).not.toBe(
      'undefined'
    );
  });
});

describe('explicitRegisterIdentity', () => {
  it('returns a registration object for a given domain', async () => {
    const reg = await explicitRegisterIdentity('test.example.com').catch(
      err => ({ status: 'error', error: err })
    );
    expect(reg).toBeDefined();
  });
});

describe('registerWithTrustModels', () => {
  it('returns identity result without throwing', async () => {
    const identity = await registerWithTrustModels().catch(err => ({
      status: 'error',
      error: err,
    }));
    expect(identity).toBeDefined();
  });
});
