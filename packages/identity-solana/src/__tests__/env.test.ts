import { describe, expect,it } from 'bun:test';

import { identitySolanaFromEnv } from '../env';

const makeKey = () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i));

describe('identitySolanaFromEnv', () => {
  it('returns empty config when no env vars set', () => {
    const config = identitySolanaFromEnv({});
    expect(config.privateKey).toBeUndefined();
    expect(config.cluster).toBeUndefined();
    expect(config.domain).toBeUndefined();
  });

  it('parses SOLANA_PRIVATE_KEY', () => {
    const config = identitySolanaFromEnv({
      SOLANA_PRIVATE_KEY: makeKey(),
    });
    expect(config.privateKey).toBeInstanceOf(Uint8Array);
    expect(config.privateKey?.length).toBe(64);
  });

  it('passes SOLANA_CLUSTER', () => {
    const config = identitySolanaFromEnv({ SOLANA_CLUSTER: 'devnet' });
    expect(config.cluster).toBe('devnet');
  });

  it('passes SOLANA_RPC_URL', () => {
    const config = identitySolanaFromEnv({
      SOLANA_RPC_URL: 'https://custom.rpc.example.com',
    });
    expect(config.rpcUrl).toBe('https://custom.rpc.example.com');
  });

  it('passes AGENT_DOMAIN', () => {
    const config = identitySolanaFromEnv({ AGENT_DOMAIN: 'agent.example.com' });
    expect(config.domain).toBe('agent.example.com');
  });

  it('parses REGISTER_IDENTITY=true', () => {
    const config = identitySolanaFromEnv({ REGISTER_IDENTITY: 'true' });
    expect(config.autoRegister).toBe(true);
  });

  it('parses REGISTER_IDENTITY=false', () => {
    const config = identitySolanaFromEnv({ REGISTER_IDENTITY: 'false' });
    expect(config.autoRegister).toBe(false);
  });

  it('does not set autoRegister when REGISTER_IDENTITY absent', () => {
    const config = identitySolanaFromEnv({});
    expect(config.autoRegister).toBeUndefined();
  });

  it('attaches env reference for downstream use', () => {
    const env = { SOLANA_CLUSTER: 'devnet' };
    const config = identitySolanaFromEnv(env);
    expect(config.env).toBe(env);
  });
});
