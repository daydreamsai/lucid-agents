import type {
  AgentChallengeResponse,
  LocalEoaSigner,
} from '@lucid-agents/types/wallets';
import { describe, expect, it } from 'bun:test';
import { mainnet } from 'viem/chains';

import { LocalEoaWalletConnector } from '../../connectors/local-eoa-connector';

const baseChallenge: AgentChallengeResponse['challenge'] = {
  id: 'challenge-1',
  credential_id: 'cred-1',
  payload: 'Sign this message',
  payload_hash: '0x1234',
  nonce: 'nonce-1',
  scopes: ['wallet.sign'],
  issued_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  expires_at: new Date('2024-01-01T00:05:00Z').toISOString(),
  server_signature: '0xserver',
};

describe('LocalEoaWalletConnector', () => {
  it('signs messages and resolves metadata', async () => {
    let signedPayload: string | Uint8Array | null = null;
    const signer: LocalEoaSigner = {
      async signMessage(payload) {
        signedPayload = payload;
        return '0xsigned';
      },
      async getAddress() {
        return '0xabc';
      },
    };

    const connector = new LocalEoaWalletConnector({
      signer,
      caip2: 'eip155:8453',
    });

    const signature = await connector.signChallenge(baseChallenge);
    expect(signature).toBe('0xsigned');
    expect(signedPayload).toBe('Sign this message');

    const metadata = await connector.getWalletMetadata();
    expect(metadata).toEqual(
      expect.objectContaining({ address: '0xabc', caip2: 'eip155:8453' })
    );
    expect(connector.supportsCaip2('eip155:8453')).toBe(true);
  });

  it('converts hex payloads into byte arrays before signing', async () => {
    let isUint8Array = false;
    const signer: LocalEoaSigner = {
      async signMessage(payload) {
        isUint8Array = payload instanceof Uint8Array;
        return '0xdead';
      },
    };

    const connector = new LocalEoaWalletConnector({ signer });
    await connector.signChallenge({
      ...baseChallenge,
      payload: '0xdeadbeef',
    });

    expect(isUint8Array).toBe(true);
  });

  it('delegates to signTypedData when typed payload provided', async () => {
    let typedDataInvoked = false;
    const typedPayload = {
      primaryType: 'Mail',
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }],
        Mail: [
          { name: 'from', type: 'string' },
          { name: 'to', type: 'string' },
        ],
      },
      domain: { name: 'Example' },
      message: { from: 'a', to: 'b' },
    } as const;

    const signer: LocalEoaSigner = {
      async signMessage(_payload) {
        throw new Error('signMessage should not be called for typed data');
      },
      async signTypedData(payload) {
        typedDataInvoked = payload.primaryType === 'Mail';
        return '0xtyped';
      },
    };

    const connector = new LocalEoaWalletConnector({ signer });

    const signature = await connector.signChallenge({
      ...baseChallenge,
      payload: { typedData: typedPayload },
    });

    expect(signature).toBe('0xtyped');
    expect(typedDataInvoked).toBe(true);
  });

  it('exposes capabilities correctly', () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
    };

    const connector = new LocalEoaWalletConnector({ signer });
    const capabilities = connector.getCapabilities();

    expect(capabilities).toEqual({ signer: true, walletClient: true });
  });

  it('returns signer via getSigner()', async () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
    };

    const connector = new LocalEoaWalletConnector({ signer });
    const returnedSigner = await connector.getSigner();

    expect(returnedSigner).toBe(signer);
  });

  it('builds wallet client from signer with walletClient config', async () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
      async getAddress() {
        return '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C6';
      },
    };

    const connector = new LocalEoaWalletConnector({
      signer,
      walletClient: {
        chainId: 84532,
        chainName: 'Base Sepolia',
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test',
      },
    });

    const walletClient = await connector.getWalletClient();
    expect(walletClient).toBeDefined();
    expect(walletClient?.account?.address).toBe(
      '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C6'
    );
  });

  it('uses built-in chain definition when chainId is known', async () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
      async getAddress() {
        return '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C6';
      },
    };

    const rpcUrl = 'https://mainnet.example.test';
    const connector = new LocalEoaWalletConnector({
      signer,
      walletClient: {
        chainId: mainnet.id,
        chainName: 'Not Ethereum',
        rpcUrl,
      },
    });

    const walletClient = await connector.getWalletClient();
    expect(walletClient?.chain?.id).toBe(mainnet.id);
    expect(walletClient?.chain?.name).toBe(mainnet.name);
    expect(walletClient?.chain?.rpcUrls.default.http).toEqual([rpcUrl]);
  });

  it('adds default fees for unknown chains', async () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
      async getAddress() {
        return '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C6';
      },
    };

    const rpcUrl = 'https://unknown-chain.example.test';
    const chainId = 999999;
    const chainName = 'Unknown Chain';

    const connector = new LocalEoaWalletConnector({
      signer,
      walletClient: {
        chainId,
        chainName,
        rpcUrl,
      },
    });

    const walletClient = await connector.getWalletClient();
    expect(walletClient?.chain?.id).toBe(chainId);
    expect(walletClient?.chain?.name).toBe(chainName);
    expect(walletClient?.chain?.rpcUrls.default.http).toEqual([rpcUrl]);
    expect(walletClient?.chain?.fees?.baseFeeMultiplier).toBe(1.2);
  });

  it('caches wallet client on subsequent calls', async () => {
    const signer: LocalEoaSigner = {
      async signMessage() {
        return '0xsigned';
      },
      async getAddress() {
        return '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C9';
      },
    };

    const connector = new LocalEoaWalletConnector({
      signer,
      walletClient: {
        chainId: 84532,
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test',
      },
    });

    const client1 = await connector.getWalletClient();
    const client2 = await connector.getWalletClient();

    expect(client1).toBe(client2);
  });
});
