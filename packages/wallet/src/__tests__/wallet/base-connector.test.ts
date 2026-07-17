import { describe, expect, it } from 'bun:test';

import type { AgentChallengeResponse } from '@lucid-agents/types/wallets';

import {
  detectMessageEncoding,
  extractSignature,
  extractWalletMetadata,
  normalizeChallenge,
} from '../../connectors/base-connector';

const challenge = (payload: unknown): AgentChallengeResponse['challenge'] => ({
  id: 'challenge-1',
  credential_id: 'credential-1',
  payload,
  payload_hash: '0x1234',
  nonce: 'nonce-1',
  scopes: ['wallet.sign'],
  issued_at: '2024-01-01T00:00:00.000Z',
  expires_at: '2024-01-01T00:05:00.000Z',
  server_signature: '0xserver',
});

describe('wallet connector payload normalization', () => {
  it('extracts signable messages from supported challenge payload shapes', () => {
    expect(normalizeChallenge(challenge(null)).message).toBeNull();
    expect(normalizeChallenge(challenge(42)).message).toBeNull();
    expect(normalizeChallenge(challenge({ message: 'message' })).message).toBe(
      'message'
    );
    expect(normalizeChallenge(challenge({ payload: 'payload' })).message).toBe(
      'payload'
    );
    expect(
      normalizeChallenge(
        challenge({
          parts: ['hello ', { text: 'world' }, { text: null }, 42],
        })
      ).message
    ).toBe('hello world');
    expect(
      normalizeChallenge(challenge({ parts: [42, null] })).message
    ).toBeNull();
  });

  it('extracts signatures from flat and nested response payloads', () => {
    expect(extractSignature(null)).toBeNull();
    expect(extractSignature('0xflat')).toBe('0xflat');
    expect(extractSignature(42)).toBeNull();
    expect(extractSignature({ signed: '0xsigned' })).toBe('0xsigned');
    expect(extractSignature({ signature: '0xdirect' })).toBe('0xdirect');
    expect(extractSignature({ signed: { signature: '0xnested' } })).toBe(
      '0xnested'
    );
    expect(extractSignature({ signed: { signature: 42 } })).toBeNull();
  });

  it('normalizes wallet metadata and rejects non-wallet payloads', () => {
    expect(extractWalletMetadata(null)).toBeNull();
    expect(extractWalletMetadata({ account: {} })).toBeNull();
    expect(
      extractWalletMetadata({
        wallet: {
          id: 'wallet-1',
          address: '0x1234',
          chain: '84532',
          chainType: 'evm',
          provider: 'local',
          caip2: 'eip155:84532',
          label: 'Wallet fallback',
        },
        account: { id: 'account-1', displayName: 'Primary account' },
      })
    ).toEqual({
      id: 'wallet-1',
      address: '0x1234',
      chain: '84532',
      chainType: 'evm',
      provider: 'local',
      caip2: 'eip155:84532',
      accountId: 'account-1',
      label: 'Primary account',
    });
    expect(
      extractWalletMetadata({ wallet: { label: 'Fallback label' } })?.label
    ).toBe('Fallback label');
  });

  it('detects hex only when the complete message is hex encoded', () => {
    expect(detectMessageEncoding(' 0xdeadBEEF ')).toBe('hex');
    expect(detectMessageEncoding('0xnot-hex')).toBe('utf-8');
    expect(detectMessageEncoding('plain text')).toBe('utf-8');
  });
});
