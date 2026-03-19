import { describe, expect, it, beforeEach } from 'bun:test';
import {
  parseSIWxHeader,
  verifySIWxPayload,
  buildSIWxExtensionDeclaration,
  buildSIWxMessage,
} from '../siwx-verify';
import type { SIWxPayload, SIWxVerifyOptions } from '../siwx-verify';
import { createInMemorySIWxStorage } from '../siwx-in-memory-storage';
import type { SIWxStorage } from '../siwx-storage';
import { privateKeyToAccount } from 'viem/accounts';

describe('SIWX Verification', () => {
  let storage: SIWxStorage;
  const domain = 'agent.example.com';
  const resourceUri = 'https://agent.example.com/api/report/invoke';

  beforeEach(async () => {
    storage = createInMemorySIWxStorage();
  });

  function makePayload(overrides?: Partial<SIWxPayload>): SIWxPayload {
    return {
      domain,
      address: '0x1234567890abcdef1234567890abcdef12345678',
      uri: resourceUri,
      version: '1',
      chainId: 'eip155:84532',
      nonce: `nonce-${Date.now()}-${Math.random()}`,
      issuedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function makeOptions(
    overrides?: Partial<SIWxVerifyOptions>
  ): SIWxVerifyOptions {
    return {
      storage,
      resourceUri,
      domain,
      skipSignatureVerification: true,
      ...overrides,
    };
  }

  describe('parseSIWxHeader', () => {
    it('should parse a valid base64-encoded JSON header', () => {
      const payload: SIWxPayload = makePayload();
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      const result = parseSIWxHeader(encoded);
      expect(result).toBeDefined();
      expect(result!.address).toBe(payload.address);
      expect(result!.domain).toBe(payload.domain);
      expect(result!.chainId).toBe(payload.chainId);
      expect(result!.nonce).toBe(payload.nonce);
    });

    it('should return undefined for null/undefined', () => {
      expect(parseSIWxHeader(null)).toBeUndefined();
      expect(parseSIWxHeader(undefined)).toBeUndefined();
      expect(parseSIWxHeader('')).toBeUndefined();
    });

    it('should return undefined for invalid base64', () => {
      expect(parseSIWxHeader('not-valid-base64!!!')).toBeUndefined();
      // Valid base64 but not valid JSON
      const notJson = Buffer.from('not json').toString('base64');
      expect(parseSIWxHeader(notJson)).toBeUndefined();
    });
  });

  describe('verifySIWxPayload', () => {
    it('should reject payload with missing required fields', async () => {
      const payloadMissingAddress = makePayload({ address: '' });
      const result = await verifySIWxPayload(
        payloadMissingAddress,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_required_fields');

      const payloadMissingChainId = makePayload({ chainId: '' });
      const result2 = await verifySIWxPayload(
        payloadMissingChainId,
        makeOptions({ requireEntitlement: false })
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('missing_required_fields');

      const payloadMissingNonce = makePayload({ nonce: '' });
      const result3 = await verifySIWxPayload(
        payloadMissingNonce,
        makeOptions({ requireEntitlement: false })
      );
      expect(result3.success).toBe(false);
      expect(result3.error).toBe('missing_required_fields');
    });

    it('should reject payload with missing issuedAt', async () => {
      const payload = makePayload({ issuedAt: '' });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_required_fields');
    });

    it('should reject payload with missing version', async () => {
      const payload = makePayload({ version: '' });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_required_fields');
    });

    it('should reject domain mismatch', async () => {
      const payload = makePayload({ domain: 'wrong.example.com' });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('domain_mismatch');
    });

    it('should reject resource URI mismatch', async () => {
      const payload = makePayload({
        uri: 'https://agent.example.com/api/other/invoke',
      });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('resource_uri_mismatch');
    });

    it('should reject expired payload', async () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();
      const payload = makePayload({ expirationTime: pastDate });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('expired');
    });

    it('should reject not-yet-valid payload', async () => {
      const futureDate = new Date(Date.now() + 60_000).toISOString();
      const payload = makePayload({ notBefore: futureDate });
      const result = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('not_yet_valid');
    });

    it('should reject replayed nonce', async () => {
      const payload = makePayload({ nonce: 'replay-nonce-123' });
      // First verification should succeed
      const result1 = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result1.success).toBe(true);

      // Second verification with same nonce should fail
      const result2 = await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('nonce_replayed');
    });

    it('should grant access when wallet has entitlement (paid-route reuse)', async () => {
      await storage.recordPayment(
        resourceUri,
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      const payload = makePayload();
      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: true,
        skipSignatureVerification: true,
      });
      expect(result.success).toBe(true);
      expect(result.grantedBy).toBe('entitlement');
      expect(result.address).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(result.chainId).toBe('eip155:84532');
      expect(result.payload).toBeDefined();
    });

    it('should deny access when wallet has no entitlement', async () => {
      const payload = makePayload();
      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: true,
        skipSignatureVerification: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('no_entitlement');
    });

    it('should not burn nonce when entitlement check fails', async () => {
      const nonce = `nonce-entitlement-check-${Date.now()}`;
      const payload = makePayload({ nonce });

      // First call: no entitlement, should fail without burning nonce
      const result1 = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: true,
        skipSignatureVerification: true,
      });
      expect(result1.success).toBe(false);
      expect(result1.error).toBe('no_entitlement');

      // Nonce should NOT be consumed
      const nonceUsed = await storage.hasUsedNonce(nonce);
      expect(nonceUsed).toBe(false);

      // Now grant entitlement and retry with same nonce — should succeed
      await storage.recordPayment(resourceUri, payload.address);
      const result2 = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: true,
        skipSignatureVerification: true,
      });
      expect(result2.success).toBe(true);
      expect(result2.grantedBy).toBe('entitlement');
    });

    it('should grant auth-only access without entitlement check', async () => {
      const payload = makePayload();
      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: false,
        skipSignatureVerification: true,
      });
      expect(result.success).toBe(true);
      expect(result.grantedBy).toBe('auth-only');
      expect(result.address).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(result.chainId).toBe('eip155:84532');
    });

    it('should record nonce after successful verification', async () => {
      const nonce = `unique-nonce-${Date.now()}`;
      const payload = makePayload({ nonce });

      // Nonce should not be used yet
      const usedBefore = await storage.hasUsedNonce(nonce);
      expect(usedBefore).toBe(false);

      // Verify the payload
      await verifySIWxPayload(
        payload,
        makeOptions({ requireEntitlement: false })
      );

      // Nonce should now be recorded
      const usedAfter = await storage.hasUsedNonce(nonce);
      expect(usedAfter).toBe(true);
    });
  });

  describe('signature verification', () => {
    // Use a known private key for deterministic test signing
    const testPrivateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
    const account = privateKeyToAccount(testPrivateKey);

    it('should reject payload with missing signature', async () => {
      const payload = makePayload({
        address: account.address,
      });
      // No signature field
      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        skipSignatureVerification: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_signature');
    });

    it('should reject payload with invalid signature', async () => {
      const payload = makePayload({
        address: account.address,
        signature: '0xdeadbeef',
      });
      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: false,
        skipSignatureVerification: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_signature');
    });

    it('should accept payload with valid EIP-191 signature', async () => {
      const payload = makePayload({
        address: account.address,
      });

      // Sign the canonical message
      const message = buildSIWxMessage(payload);
      const signature = await account.signMessage({ message });
      payload.signature = signature;

      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: false,
        skipSignatureVerification: false,
      });
      expect(result.success).toBe(true);
      expect(result.grantedBy).toBe('auth-only');
      expect(result.address).toBe(account.address.toLowerCase());
    });

    it('should reject signature from wrong address', async () => {
      const otherKey =
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
      const otherAccount = privateKeyToAccount(otherKey);

      const payload = makePayload({
        address: account.address, // claims to be account
      });

      // But signed by otherAccount
      const message = buildSIWxMessage(payload);
      const signature = await otherAccount.signMessage({ message });
      payload.signature = signature;

      const result = await verifySIWxPayload(payload, {
        storage,
        resourceUri,
        domain,
        requireEntitlement: false,
        skipSignatureVerification: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_signature');
    });
  });

  describe('buildSIWxMessage', () => {
    it('should produce a CAIP-122 compliant message', () => {
      const payload = makePayload({
        statement: 'Sign in to reuse access.',
        nonce: 'abc123',
        issuedAt: '2026-03-19T00:00:00.000Z',
      });
      const message = buildSIWxMessage(payload);
      expect(message).toContain(
        'agent.example.com wants you to sign in with your account:'
      );
      expect(message).toContain(payload.address);
      expect(message).toContain('Sign in to reuse access.');
      expect(message).toContain(`URI: ${resourceUri}`);
      expect(message).toContain('Version: 1');
      expect(message).toContain('Chain ID: eip155:84532');
      expect(message).toContain('Nonce: abc123');
      expect(message).toContain('Issued At: 2026-03-19T00:00:00.000Z');
    });

    it('should omit optional fields when not present', () => {
      const payload = makePayload();
      const message = buildSIWxMessage(payload);
      expect(message).not.toContain('Expiration Time:');
      expect(message).not.toContain('Not Before:');
      expect(message).not.toContain('Resources:');
    });
  });

  describe('buildSIWxExtensionDeclaration', () => {
    it('should build a valid extension declaration', () => {
      const decl = buildSIWxExtensionDeclaration({
        resourceUri,
        domain,
        statement: 'Sign in to reuse access.',
        chainId: 'eip155:84532',
        expirationSeconds: 300,
      });
      expect(decl.scheme).toBe('sign-in-with-x');
      expect(decl.domain).toBe(domain);
      expect(decl.uri).toBe(resourceUri);
      expect(decl.nonce).toBeDefined();
      expect(typeof decl.nonce).toBe('string');
      expect((decl.nonce as string).length).toBe(32); // 16 bytes = 32 hex chars
      expect(decl.version).toBe('1');
      expect(decl.chainId).toBe('eip155:84532');
      expect(decl.statement).toBe('Sign in to reuse access.');
      expect(decl.expirationTime).toBeDefined();
      expect(decl.issuedAt).toBeDefined();
    });

    it('should omit expirationTime when not configured', () => {
      const decl = buildSIWxExtensionDeclaration({
        resourceUri,
        domain,
      });
      expect(decl.expirationTime).toBeUndefined();
      expect(decl.issuedAt).toBeDefined();
      expect(decl.nonce).toBeDefined();
    });

    it('should omit statement when not provided', () => {
      const decl = buildSIWxExtensionDeclaration({
        resourceUri,
        domain,
        chainId: 'eip155:84532',
      });
      expect(decl.statement).toBeUndefined();
      expect(decl.domain).toBe(domain);
      expect(decl.uri).toBe(resourceUri);
    });
  });
});
