import { beforeEach, describe, expect, it } from 'bun:test';
import { encodeSIWxHeader } from '@x402/extensions/sign-in-with-x';
import { privateKeyToAccount } from 'viem/accounts';
import { createInMemorySIWxStorage } from '../siwx-in-memory-storage';
import type { SIWxStorage } from '../siwx-storage';
import {
  buildSIWxExtensionDeclaration,
  buildSIWxMessage,
  parseSIWxHeader,
  verifySIWxPayload,
  type SIWxPayload,
  type SIWxVerifyOptions,
} from '../siwx-verify';

describe('official SIWX verification', () => {
  let storage: SIWxStorage;
  const origin = 'https://agent.example.com';
  const resourceUri = `${origin}/api/report/invoke`;

  beforeEach(() => {
    storage = createInMemorySIWxStorage();
  });

  function makePayload(overrides?: Partial<SIWxPayload>): SIWxPayload {
    return {
      domain: 'agent.example.com',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      uri: resourceUri,
      version: '1',
      chainId: 'eip155:84532',
      type: 'eip191',
      nonce: `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`,
      issuedAt: new Date().toISOString(),
      signature: '0xtest-signature',
      ...overrides,
    };
  }

  function makeOptions(
    overrides?: Partial<SIWxVerifyOptions>
  ): SIWxVerifyOptions {
    return {
      storage,
      resourceUri,
      origin,
      requireEntitlement: false,
      skipSignatureVerification: true,
      ...overrides,
    };
  }

  describe('parseSIWxHeader', () => {
    it('uses the official schema and accepts an official encoded payload', () => {
      const payload = makePayload();

      expect(parseSIWxHeader(encodeSIWxHeader(payload))).toEqual(payload);
    });

    it('rejects legacy payloads without the official signature type', () => {
      const { type: _type, ...legacyPayload } = makePayload();
      const encoded = Buffer.from(JSON.stringify(legacyPayload)).toString(
        'base64'
      );

      expect(parseSIWxHeader(encoded)).toBeUndefined();
    });

    it('rejects absent, malformed, and non-JSON values', () => {
      expect(parseSIWxHeader(null)).toBeUndefined();
      expect(parseSIWxHeader(undefined)).toBeUndefined();
      expect(parseSIWxHeader('')).toBeUndefined();
      expect(parseSIWxHeader('not-valid-base64!!!')).toBeUndefined();
      expect(
        parseSIWxHeader(Buffer.from('not json').toString('base64'))
      ).toBeUndefined();
    });
  });

  describe('verifySIWxPayload', () => {
    it('rejects payloads that fail the official payload schema', async () => {
      const { type: _type, ...legacyPayload } = makePayload();
      const payload = legacyPayload as SIWxPayload;

      const result = await verifySIWxPayload(payload, makeOptions());

      expect(result).toEqual({
        success: false,
        error: 'invalid_siwx_payload',
      });
    });

    it('uses official domain validation against the configured origin', async () => {
      const result = await verifySIWxPayload(
        makePayload({ domain: 'internal.service.local' }),
        makeOptions()
      );

      expect(result.error).toBe('invalid_siwx_domain_mismatch');
    });

    it('binds the proof to the exact public resource URI', async () => {
      const result = await verifySIWxPayload(
        makePayload({ uri: `${origin}/api/other/invoke` }),
        makeOptions()
      );

      expect(result.error).toBe('invalid_siwx_uri_mismatch');
    });

    it('uses official expiration and not-before validation', async () => {
      const expired = await verifySIWxPayload(
        makePayload({
          expirationTime: new Date(Date.now() - 60_000).toISOString(),
        }),
        makeOptions()
      );
      const notYetValid = await verifySIWxPayload(
        makePayload({
          notBefore: new Date(Date.now() + 60_000).toISOString(),
        }),
        makeOptions()
      );

      expect(expired.error).toBe('invalid_siwx_expired');
      expect(notYetValid.error).toBe('invalid_siwx_not_yet_valid');
    });

    it('rejects a chain that was not declared by the resource', async () => {
      const result = await verifySIWxPayload(makePayload(), {
        ...makeOptions(),
        supportedChainIds: ['eip155:8453'],
      });

      expect(result.error).toBe('invalid_siwx_chain_id');
    });

    it('atomically rejects concurrent nonce replay', async () => {
      const payload = makePayload({ nonce: 'concurrent-replay-nonce' });

      const results = await Promise.all([
        verifySIWxPayload(payload, makeOptions()),
        verifySIWxPayload(payload, makeOptions()),
      ]);

      expect(results.filter(result => result.success)).toHaveLength(1);
      expect(results.filter(result => !result.success)).toEqual([
        { success: false, error: 'nonce_replayed' },
      ]);
    });

    it('checks paid entitlement before consuming the nonce', async () => {
      const payload = makePayload({ nonce: 'entitlement-retry-nonce' });
      const options = makeOptions({
        requireEntitlement: true,
        entitlementResource: 'https://agent.example.com/scoped-entitlement',
      });

      const unpaid = await verifySIWxPayload(payload, options);
      expect(unpaid.error).toBe('no_entitlement');
      expect(await storage.hasUsedNonce(payload.nonce)).toBe(false);

      await storage.recordPayment(
        options.entitlementResource!,
        payload.address.toLowerCase()
      );
      const paid = await verifySIWxPayload(payload, options);

      expect(paid.success).toBe(true);
      expect(paid.grantedBy).toBe('entitlement');
    });

    it('preserves auth-only grants and AgentAuthContext identity fields', async () => {
      const result = await verifySIWxPayload(makePayload(), makeOptions());

      expect(result.success).toBe(true);
      expect(result.grantedBy).toBe('auth-only');
      expect(result.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(result.chainId).toBe('eip155:84532');
      expect(result.payload?.type).toBe('eip191');
    });
  });

  describe('official signature helpers', () => {
    const account = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    );

    it('accepts a valid EIP-191 SIWE signature', async () => {
      const payload = makePayload({ address: account.address });
      payload.signature = await account.signMessage({
        message: buildSIWxMessage(payload),
      });

      const result = await verifySIWxPayload(payload, {
        ...makeOptions(),
        skipSignatureVerification: false,
      });

      expect(result.success).toBe(true);
      expect(result.address).toBe(account.address.toLowerCase());
    });

    it('rejects malformed or wrong signatures with official error codes', async () => {
      const result = await verifySIWxPayload(
        makePayload({
          address: account.address,
          signature: '0xdeadbeef',
        }),
        {
          ...makeOptions(),
          skipSignatureVerification: false,
        }
      );

      expect(result.error).toBe('invalid_siwx_signature');
    });

    it('passes an EVM verifier through for smart-wallet verification', async () => {
      let verifierCalled = false;
      const result = await verifySIWxPayload(
        makePayload({ address: account.address }),
        {
          ...makeOptions(),
          skipSignatureVerification: false,
          evmVerifier: async () => {
            verifierCalled = true;
            return true;
          },
        }
      );

      expect(result.success).toBe(true);
      expect(verifierCalled).toBe(true);
    });

    it('formats the official SIWE message', () => {
      const message = buildSIWxMessage(
        makePayload({
          statement: 'Sign in to reuse access.',
          nonce: 'abc12345',
        })
      );

      expect(message).toContain(
        'agent.example.com wants you to sign in with your Ethereum account:'
      );
      expect(message).toContain(`URI: ${resourceUri}`);
      expect(message).toContain('Chain ID: 84532');
      expect(message).toContain('Nonce: abc12345');
    });
  });

  describe('official extension declaration', () => {
    it('uses the standard info, supportedChains, and schema shape', () => {
      const declaration = buildSIWxExtensionDeclaration({
        resourceUri,
        statement: 'Sign in to reuse access.',
        chainId: ['eip155:84532', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
        expirationSeconds: 300,
      });

      expect(declaration.info.domain).toBe('agent.example.com');
      expect(declaration.info.uri).toBe(resourceUri);
      expect(declaration.info.statement).toBe('Sign in to reuse access.');
      expect(declaration.info.nonce).toHaveLength(32);
      expect(declaration.info.expirationTime).toBeDefined();
      expect(declaration.supportedChains).toEqual([
        { chainId: 'eip155:84532', type: 'eip191' },
        {
          chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          type: 'ed25519',
        },
      ]);
      expect(declaration.schema.required).toContain('type');
      expect(declaration.schema.required).toContain('signature');
    });

    it('derives domain from the resource rather than a separate authority', () => {
      expect(() =>
        buildSIWxExtensionDeclaration({
          resourceUri,
          domain: 'spoofed.example.com',
        })
      ).toThrow('does not match resource origin');
    });
  });
});
