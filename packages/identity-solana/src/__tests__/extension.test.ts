import { describe, expect,it } from 'bun:test';

import { identitySolana } from '../extension';

const makeRuntime = () => ({
  wallets: {},
  entrypoints: { snapshot: () => [] },
} as any);

const makeCard = () => ({
  name: 'test-agent',
  version: '1.0.0',
  entrypoints: [],
  capabilities: {},
} as any);

describe('identitySolana extension', () => {
  describe('contract: .use() attaches correctly', () => {
    it('returns an extension object with name identity-solana', () => {
      const ext = identitySolana();
      expect(ext.name).toBe('identity-solana');
    });

    it('has build, onBuild, onManifestBuild lifecycle methods', () => {
      const ext = identitySolana();
      expect(typeof ext.build).toBe('function');
      expect(typeof ext.onBuild).toBe('function');
      expect(typeof ext.onManifestBuild).toBe('function');
    });
  });

  describe('build()', () => {
    it('returns empty object when no config provided', () => {
      const ext = identitySolana();
      const result = ext.build();
      expect(result.trust).toBeUndefined();
      expect(result.identity).toBeUndefined();
    });

    it('returns trust from config when pre-supplied', () => {
      const trust = { trustModels: ['feedback'] as string[] };
      const ext = identitySolana({ config: { trust } });
      const result = ext.build();
      expect(result.trust).toBe(trust);
    });

    it('returns identity when registration config provided', () => {
      const ext = identitySolana({
        config: {
          registration: { name: 'Test Agent', skipSend: false },
        },
      });
      const result = ext.build();
      expect(result.identity?.registration?.name).toBe('Test Agent');
    });
  });

  describe('onBuild()', () => {
    it('skips registration when trust already provided', async () => {
      const trust = { trustModels: ['feedback'] as string[] };
      const ext = identitySolana({ config: { trust } });
      // onBuild should not error; trust is already set
      await expect(ext.onBuild!(makeRuntime())).resolves.toBeUndefined();
    });

    it('does not throw when no config provided', async () => {
      const ext = identitySolana();
      await expect(ext.onBuild!(makeRuntime())).resolves.toBeUndefined();
    });
  });

  describe('onManifestBuild()', () => {
    it('returns original card when no trust configured', () => {
      const ext = identitySolana();
      const card = makeCard();
      const result = ext.onManifestBuild!(card, makeRuntime());
      // No trust = card returned unchanged (structurally equal)
      expect(result.name).toBe(card.name);
    });

    it('merges trust into card when trust config present', () => {
      const trust = {
        trustModels: ['feedback', 'inference-validation'] as string[],
        registrations: [{ agentId: '42', agentRegistry: 'solana:devnet:8004' }],
      };
      const ext = identitySolana({ config: { trust } });
      const card = makeCard();
      const result = ext.onManifestBuild!(card, makeRuntime());
      expect(result.trustModels).toContain('feedback');
      expect(result.registrations?.length).toBe(1);
    });

    it('does not mutate original card', () => {
      const trust = { trustModels: ['feedback'] as string[] };
      const ext = identitySolana({ config: { trust } });
      const card = makeCard();
      ext.onManifestBuild!(card, makeRuntime());
      expect(card.trustModels).toBeUndefined();
    });
  });
});
