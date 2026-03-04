import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  identitySolana,
  identitySolanaFromEnv,
  createAgentCardWithSolanaIdentity,
  parseBoolean,
  validateCluster,
  validatePrivateKey,
  validateDomain,
  validateRegistration,
  validateIdentityConfig,
  TrustTier,
  getTrustTierName,
  getTrustTierColor,
} from '../index';
import type { AgentRuntime } from '@lucid-agents/types/core';

describe('identity-solana', () => {
  describe('parseBoolean()', () => {
    it('should return true for "true"', () => {
      expect(parseBoolean('true')).toBe(true);
    });

    it('should return true for "1"', () => {
      expect(parseBoolean('1')).toBe(true);
    });

    it('should return false for "false"', () => {
      expect(parseBoolean('false')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(parseBoolean(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(parseBoolean('')).toBe(false);
    });
  });

  describe('validateCluster()', () => {
    it('should return mainnet-beta for undefined', () => {
      expect(validateCluster(undefined)).toBe('mainnet-beta');
    });

    it('should return mainnet-beta for mainnet-beta', () => {
      expect(validateCluster('mainnet-beta')).toBe('mainnet-beta');
    });

    it('should return testnet for testnet', () => {
      expect(validateCluster('testnet')).toBe('testnet');
    });

    it('should return devnet for devnet', () => {
      expect(validateCluster('devnet')).toBe('devnet');
    });

    it('should default to mainnet-beta for invalid cluster', () => {
      expect(validateCluster('invalid')).toBe('mainnet-beta');
    });
  });

  describe('validatePrivateKey()', () => {
    it('should return true for valid 64-char hex', () => {
      expect(validatePrivateKey('a'.repeat(64))).toBe(true);
    });

    it('should return true for 0x prefixed hex', () => {
      expect(validatePrivateKey('0x' + 'a'.repeat(64))).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(validatePrivateKey(undefined)).toBe(false);
    });

    it('should return false for invalid length', () => {
      expect(validatePrivateKey('abc')).toBe(false);
    });
  });

  describe('validateDomain()', () => {
    it('should return true for valid domain', () => {
      expect(validateDomain('agent.example.com')).toBe(true);
    });

    it('should return true for domain with dash', () => {
      expect(validateDomain('my-agent.io')).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(validateDomain(undefined)).toBe(false);
    });

    it('should return false for domain starting with dash', () => {
      expect(validateDomain('-agent.com')).toBe(false);
    });
  });

  describe('validateRegistration()', () => {
    it('should return true for valid registration', () => {
      const registration = { name: 'Test Agent' };
      expect(validateRegistration(registration)).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(validateRegistration(undefined)).toBe(false);
    });

    it('should return false for name too short', () => {
      const registration = { name: 'A' };
      expect(validateRegistration(registration)).toBe(false);
    });

    it('should return false for missing name', () => {
      const registration = { description: 'Test' };
      expect(validateRegistration(registration)).toBe(false);
    });
  });

  describe('validateIdentityConfig()', () => {
    it('should return true for valid config', () => {
      const config = { rpcUrl: 'https://api.mainnet-beta.solana.com' };
      expect(validateIdentityConfig(config)).toBe(true);
    });

    it('should return false for invalid rpcUrl', () => {
      const config = { rpcUrl: 'not-a-url' };
      expect(validateIdentityConfig(config)).toBe(false);
    });

    it('should return true for empty config', () => {
      expect(validateIdentityConfig({})).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(validateIdentityConfig(undefined)).toBe(false);
    });
  });

  describe('identitySolana() builder', () => {
    it('should create extension with config', () => {
      const ext = identitySolana({
        config: {
          domain: 'test.agent',
          rpcUrl: 'https://api.mainnet-beta.solana.com',
        },
      });

      expect(ext.name).toBe('identity-solana');
      expect(ext.build()).toBeDefined();
    });

    it('should work without config', () => {
      const ext = identitySolana();
      expect(ext.name).toBe('identity-solana');
    });

    it('should have onManifestBuild hook', async () => {
      const ext = identitySolana();
      expect(ext.onManifestBuild).toBeDefined();
    });

    it('should have onBuild hook', async () => {
      const ext = identitySolana();
      expect(ext.onBuild).toBeDefined();
    });
  });

  describe('createAgentCardWithSolanaIdentity()', () => {
    it('should merge trust config into card', () => {
      const card = {
        name: 'Test Agent',
        url: 'https://test.agent',
      } as unknown as import('@lucid-agents/types/a2a').AgentCardWithEntrypoints;

      const trustConfig = {
        solana: {
          trustTier: { tier: TrustTier.VERIFIED },
          identityAccount: 'testIdentity123',
          registryProgram: 'testProgram456',
        },
      };

      const result = createAgentCardWithSolanaIdentity(card, trustConfig);

      expect(result.capabilities?.trustTier).toBe(TrustTier.VERIFIED);
    });

    it('should return original card if no trust config', () => {
      const card = {
        name: 'Test Agent',
      } as unknown as import('@lucid-agents/types/a2a').AgentCardWithEntrypoints;

      const result = createAgentCardWithSolanaIdentity(card, {});

      expect(result.name).toBe('Test Agent');
    });

    it('should set verified for high trust tier', () => {
      const card = {
        name: 'Test Agent',
        verified: false,
      } as unknown as import('@lucid-agents/types/a2a').AgentCardWithEntrypoints;

      const trustConfig = {
        solana: {
          trustTier: { tier: TrustTier.VERIFIED },
        },
      };

      const result = createAgentCardWithSolanaIdentity(card, trustConfig);

      expect(result.verified).toBe(true);
    });
  });

  describe('TrustTier utilities', () => {
    it('getTrustTierName should return correct names', () => {
      expect(getTrustTierName(TrustTier.NONE)).toBe('None');
      expect(getTrustTierName(TrustTier.BASIC)).toBe('Basic');
      expect(getTrustTierName(TrustTier.VERIFIED)).toBe('Verified');
      expect(getTrustTierName(TrustTier.PREMIUM)).toBe('Premium');
    });

    it('getTrustTierColor should return correct colors', () => {
      expect(getTrustTierColor(TrustTier.NONE)).toBe('#666666');
      expect(getTrustTierColor(TrustTier.BASIC)).toBe('#3B82F6');
      expect(getTrustTierColor(TrustTier.VERIFIED)).toBe('#10B981');
      expect(getTrustTierColor(TrustTier.PREMIUM)).toBe('#F59E0B');
    });
  });

  describe('identitySolanaFromEnv()', () => {
    // These tests modify process.env but that's okay for isolated test env
    it('should parse from environment', () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'devnet';
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      process.env.AGENT_DOMAIN = 'test.agent';

      const config = identitySolanaFromEnv();

      expect(config.cluster).toBe('devnet');
      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
      expect(config.domain).toBe('test.agent');
      
      if (original !== undefined) {
        process.env.SOLANA_CLUSTER = original;
      }
    });

    it('should use config overrides over env', () => {
      const original = process.env.SOLANA_CLUSTER;
      process.env.SOLANA_CLUSTER = 'devnet';
      process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
      
      delete process.env.REGISTER_IDENTITY;

      const config = identitySolanaFromEnv({
        cluster: 'mainnet-beta',
      });

      expect(config.cluster).toBe('mainnet-beta');
      expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
      
      if (original !== undefined) {
        process.env.SOLANA_CLUSTER = original;
      }
    });

    it('should parse autoRegister from REGISTER_IDENTITY', () => {
      process.env.REGISTER_IDENTITY = 'true';
      delete process.env.IDENTITY_AUTO_REGISTER;

      const config = identitySolanaFromEnv();

      expect(config.autoRegister).toBe(true);
    });

    it('should parse autoRegister from IDENTITY_AUTO_REGISTER', () => {
      delete process.env.REGISTER_IDENTITY;
      process.env.IDENTITY_AUTO_REGISTER = 'false';

      const config = identitySolanaFromEnv();

      expect(config.autoRegister).toBe(false);
    });
  });

  describe('TrustTier enum', () => {
    it('should have correct numeric values', () => {
      expect(TrustTier.NONE).toBe(0);
      expect(TrustTier.BASIC).toBe(1);
      expect(TrustTier.VERIFIED).toBe(2);
      expect(TrustTier.PREMIUM).toBe(3);
    });
  });
});
