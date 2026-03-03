import { describe, it, expect } from 'bun:test';
import {
  identitySolana,
  identitySolanaFromEnv,
  createSolanaAgentIdentity,
  mapTrustTierToConfig,
} from '@lucid-agents/identity-solana';

describe('solana-identity example: identitySolana extension', () => {
  it('creates extension with name identity-solana', () => {
    const ext = identitySolana();
    expect(ext.name).toBe('identity-solana');
  });

  it('identitySolanaFromEnv with devnet cluster', () => {
    const config = identitySolanaFromEnv({ SOLANA_CLUSTER: 'devnet' });
    expect(config.cluster).toBe('devnet');
  });

  it('identitySolanaFromEnv without private key returns no key', () => {
    const config = identitySolanaFromEnv({});
    expect(config.privateKey).toBeUndefined();
  });
});

describe('solana-identity example: createSolanaAgentIdentity', () => {
  it('returns no-identity when no key and autoRegister=false', async () => {
    const identity = await createSolanaAgentIdentity({
      autoRegister: false,
      cluster: 'devnet',
      env: {},
    });
    expect(identity.status).toContain('No 8004-Solana');
    expect(identity.clients).toBeDefined();
  });

  it('includes registry clients always', async () => {
    const identity = await createSolanaAgentIdentity({
      autoRegister: false,
      env: {},
    });
    expect(identity.clients?.identity).toBeDefined();
    expect(identity.clients?.reputation).toBeDefined();
  });

  it('maps TrustTier to TrustConfig correctly', () => {
    const trust = mapTrustTierToConfig(
      3, // Gold
      BigInt(100),
      'devnet',
      undefined,
      ['feedback']
    );
    expect(trust.registrations?.[0].agentId).toBe('100');
    expect(trust.registrations?.[0].agentRegistry).toContain('solana:devnet');
    expect(trust.trustModels).toContain('feedback');
  });
});
