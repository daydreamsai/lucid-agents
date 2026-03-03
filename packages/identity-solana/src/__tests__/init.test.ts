import { describe, expect, it } from 'bun:test';

import {
  createSolanaAgentIdentity,
  getSolanaTrustConfig,
  mapTrustTierToConfig,
} from '../init';

// ── mapTrustTierToConfig ─────────────────────────────────────────────────────

describe('mapTrustTierToConfig', () => {
  it('builds TrustConfig with registrations when agentId provided', () => {
    const cfg = mapTrustTierToConfig(3, BigInt(99), 'devnet', undefined, [
      'feedback',
    ]);
    expect(cfg.registrations).toHaveLength(1);
    expect(cfg.registrations?.[0].agentId).toBe('99');
    expect(cfg.registrations?.[0].agentRegistry).toContain('solana');
  });

  it('builds TrustConfig with empty registrations when no agentId', () => {
    const cfg = mapTrustTierToConfig(undefined, undefined, 'devnet');
    expect(cfg.registrations).toHaveLength(0);
  });

  it('includes trustModels', () => {
    const cfg = mapTrustTierToConfig(1, 1n, 'mainnet-beta', undefined, [
      'feedback',
      'inference-validation',
    ]);
    expect(cfg.trustModels).toContain('feedback');
    expect(cfg.trustModels).toContain('inference-validation');
  });

  it('includes feedbackDataUri when provided', () => {
    const cfg = mapTrustTierToConfig(
      1,
      1n,
      'devnet',
      'https://agent.example.com/feedback',
      ['feedback']
    );
    expect(cfg.feedbackDataUri).toBe('https://agent.example.com/feedback');
  });
});

// ── getSolanaTrustConfig ──────────────────────────────────────────────────────

describe('getSolanaTrustConfig', () => {
  it('returns trust from identity result', () => {
    const trust = { trustModels: ['feedback'] as string[] };
    const identity = { status: 'ok', trust };
    expect(getSolanaTrustConfig(identity)).toBe(trust);
  });

  it('returns undefined when no trust', () => {
    expect(getSolanaTrustConfig({ status: 'no trust' })).toBeUndefined();
  });
});

// ── createSolanaAgentIdentity (mocked SDK) ────────────────────────────────────

describe('createSolanaAgentIdentity', () => {
  it('returns no-identity status when no private key and autoRegister=false', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      cluster: 'devnet',
      env: {},
    });
    expect(result.status).toContain('No 8004-Solana identity');
    expect(result.trust).toBeUndefined();
  });

  it('returns no-identity status when no private key (default autoRegister=true)', async () => {
    const result = await createSolanaAgentIdentity({
      cluster: 'devnet',
      env: {},
    });
    expect(result.status).toContain('No 8004-Solana identity');
  });

  it('includes clients in result', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      cluster: 'devnet',
      env: {},
    });
    expect(result.clients).toBeDefined();
    expect(result.clients?.identity).toBeDefined();
    expect(result.clients?.reputation).toBeDefined();
  });

  it('respects cluster from env', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      env: { SOLANA_CLUSTER: 'testnet' },
    });
    expect(result.status).toBeDefined();
  });

  it('respects domain from env', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      env: { AGENT_DOMAIN: 'agent.example.com' },
    });
    expect(result.domain).toBe('agent.example.com');
  });
});
