import type { AgentChallenge } from '@lucid-agents/types/wallets';
import { describe, expect, it } from 'bun:test';
import type { WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ViemWalletConnector } from '../../connectors/viem-wallet-connector';

const primary = privateKeyToAccount(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);
const secondary = privateKeyToAccount(
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);

const challenge: AgentChallenge = {
  id: 'challenge-1',
  credential_id: 'credential-1',
  payload: { action: 'authenticate' },
  payload_hash: '0x1234',
  nonce: 'nonce-1',
  scopes: ['wallet.sign'],
  issued_at: '2024-01-01T00:00:00.000Z',
  expires_at: '2024-01-01T00:05:00.000Z',
  server_signature: '0xserver',
};

const makeClient = (overrides: Record<string, unknown> = {}): WalletClient =>
  ({
    account: primary,
    chain: { id: 84532 },
    async signMessage({ message }: { message: string | { raw: Uint8Array } }) {
      return primary.signMessage({ message });
    },
    async signTypedData() {
      return '0xtyped';
    },
    ...overrides,
  }) as unknown as WalletClient;

describe('ViemWalletConnector', () => {
  it('exposes wallet metadata, capabilities, and the underlying client', async () => {
    const client = makeClient();
    const connector = new ViemWalletConnector({
      walletClient: client,
      metadata: { provider: 'browser', label: 'developer' },
    });

    expect(await connector.getWalletMetadata()).toEqual({
      address: primary.address,
      chain: '84532',
      chainType: 'evm',
      provider: 'browser',
      caip2: 'eip155:84532',
      label: 'developer',
    });
    expect(connector.supportsCaip2('eip155:84532')).toBe(true);
    expect(connector.supportsCaip2('eip155:1')).toBe(false);
    expect(await connector.getAddress()).toBe(primary.address);
    expect(connector.getCapabilities()).toEqual({
      walletClient: true,
      signer: true,
    });
    expect((await connector.getWalletClient()) === client).toBe(true);
  });

  it('signs messages, byte arrays, typed data, and challenges', async () => {
    const connector = new ViemWalletConnector({ walletClient: makeClient() });
    const signer = await connector.getSigner();

    expect(signer).not.toBeNull();
    expect(await signer!.signMessage('hello')).toMatch(/^0x[0-9a-f]+$/i);
    expect(
      await signer!.signMessage(new TextEncoder().encode('bytes'))
    ).toMatch(/^0x[0-9a-f]+$/i);
    expect(
      await signer!.signTypedData?.({
        domain: { name: 'Agent' },
        primaryType: 'Mail',
        types: { Mail: [{ name: 'body', type: 'string' }] },
        message: { body: 'hello' },
      })
    ).toBe('0xtyped');
    expect(await signer!.getAddress?.()).toBe(primary.address);
    expect(await connector.signChallenge(challenge)).toMatch(/^0x[0-9a-f]+$/i);
  });

  it('handles clients without accounts or chains', async () => {
    const connector = new ViemWalletConnector({
      walletClient: makeClient({ account: undefined, chain: undefined }),
    });

    expect(await connector.getWalletMetadata()).toEqual(
      expect.objectContaining({ address: null, chain: null, caip2: null })
    );
    expect(connector.supportsCaip2('eip155:84532')).toBe(false);
    expect(await connector.getAddress()).toBeNull();
    expect(await connector.getSigner()).toBeNull();
    await expect(connector.signChallenge(challenge)).rejects.toThrow(
      'No account available'
    );
  });

  it('rejects typed data when the wallet does not implement it', async () => {
    const client = makeClient();
    Object.assign(client, { signTypedData: undefined });
    const signer = await new ViemWalletConnector({
      walletClient: client,
    }).getSigner();

    await expect(
      signer!.signTypedData?.({
        domain: {},
        primaryType: 'Mail',
        types: { Mail: [] },
        message: {},
      })
    ).rejects.toThrow('Typed data signing not supported');
  });

  it('checks account presence each time a signer is used', async () => {
    const client = makeClient();
    const signer = await new ViemWalletConnector({
      walletClient: client,
    }).getSigner();
    Object.assign(client, { account: undefined });

    await expect(signer!.signMessage('hello')).rejects.toThrow(
      'No account available'
    );
    await expect(
      signer!.signTypedData?.({
        domain: {},
        primaryType: 'Mail',
        types: { Mail: [] },
        message: {},
      })
    ).rejects.toThrow('No account available');
    expect(await signer!.getAddress?.()).toBeNull();
  });

  it('rejects challenge signatures recovered from another account', async () => {
    const connector = new ViemWalletConnector({
      walletClient: makeClient({
        async signMessage({ message }: { message: string }) {
          return secondary.signMessage({ message });
        },
      }),
    });

    await expect(connector.signChallenge(challenge)).rejects.toThrow(
      'Signature verification failed'
    );
  });
});
