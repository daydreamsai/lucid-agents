import { describe, expect, it, afterEach } from 'bun:test';
import {
  parseSolanaPrivateKey,
  normalizeCluster,
  identitySolanaFromEnv,
} from '../env.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('parseSolanaPrivateKey', () => {
  it('parses a valid JSON byte array', () => {
    const bytes = Array.from({ length: 64 }, (_, i) => i);
    const result = parseSolanaPrivateKey(JSON.stringify(bytes));
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result?.length).toBe(64);
  });

  it('returns undefined when key is not set', () => {
    expect(parseSolanaPrivateKey(undefined)).toBeUndefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSolanaPrivateKey('not-json')).toThrow();
  });

  it('throws when value is not an array', () => {
    expect(() => parseSolanaPrivateKey('{"key": "value"}')).toThrow(
      /JSON array/
    );
  });
});

describe('normalizeCluster', () => {
  it('normalizes "mainnet" to "mainnet-beta"', () => {
    expect(normalizeCluster('mainnet')).toBe('mainnet-beta');
  });

  it('normalizes "mainnet-beta" correctly', () => {
    expect(normalizeCluster('mainnet-beta')).toBe('mainnet-beta');
  });

  it('handles devnet', () => {
    expect(normalizeCluster('devnet')).toBe('devnet');
  });

  it('handles testnet', () => {
    expect(normalizeCluster('testnet')).toBe('testnet');
  });

  it('defaults to mainnet-beta when undefined', () => {
    expect(normalizeCluster(undefined)).toBe('mainnet-beta');
  });

  it('passes through unknown clusters', () => {
    expect(normalizeCluster('localnet')).toBe('localnet');
  });
});

describe('identitySolanaFromEnv', () => {
  it('reads AGENT_DOMAIN from env', () => {
    process.env.AGENT_DOMAIN = 'my-agent.example.com';
    const config = identitySolanaFromEnv();
    expect(config.domain).toBe('my-agent.example.com');
  });

  it('reads SOLANA_CLUSTER from env', () => {
    process.env.SOLANA_CLUSTER = 'devnet';
    const config = identitySolanaFromEnv();
    expect(config.cluster).toBe('devnet');
  });

  it('reads SOLANA_RPC_URL from env', () => {
    process.env.SOLANA_RPC_URL = 'https://custom.rpc.example.com';
    const config = identitySolanaFromEnv();
    expect(config.rpcUrl).toBe('https://custom.rpc.example.com');
  });

  it('reads REGISTER_IDENTITY=true', () => {
    process.env.REGISTER_IDENTITY = 'true';
    const config = identitySolanaFromEnv();
    expect(config.autoRegister).toBe(true);
  });

  it('reads REGISTER_IDENTITY=false', () => {
    process.env.REGISTER_IDENTITY = 'false';
    const config = identitySolanaFromEnv();
    expect(config.autoRegister).toBe(false);
  });

  it('applies overrides over env', () => {
    process.env.AGENT_DOMAIN = 'env-domain.example.com';
    process.env.SOLANA_CLUSTER = 'devnet';
    const config = identitySolanaFromEnv({
      domain: 'override-domain.example.com',
      cluster: 'testnet',
    });
    expect(config.domain).toBe('override-domain.example.com');
    expect(config.cluster).toBe('testnet');
  });

  it('returns autoRegister undefined when env not set', () => {
    delete process.env.REGISTER_IDENTITY;
    delete process.env.IDENTITY_AUTO_REGISTER;
    const config = identitySolanaFromEnv();
    expect(config.autoRegister).toBeUndefined();
  });

  it('defaults cluster to mainnet-beta when env not set', () => {
    delete process.env.SOLANA_CLUSTER;
    const config = identitySolanaFromEnv();
    expect(config.cluster).toBe('mainnet-beta');
  });
});
