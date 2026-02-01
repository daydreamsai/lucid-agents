import { afterEach, describe, expect, it, mock } from 'bun:test';

import { LocalEoaWalletConnector } from '../../connectors/local-eoa-connector';
import { ServerOrchestratorWalletConnector } from '../../connectors/server-orchestrator-connector';
import { ThirdwebWalletConnector } from '../../connectors/thirdweb-connector';
import { createAgentWallet } from '../../runtime';

describe('createAgentWallet', () => {
  afterEach(() => {
    mock.restore();
  });

  it('builds a local wallet from a private key', async () => {
    const handle = createAgentWallet({
      type: 'local',
      privateKey:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      caip2: 'eip155:8453',
    });

    expect(handle.kind).toBe('local');
    expect(handle.connector).toBeInstanceOf(LocalEoaWalletConnector);

    const address = await handle.connector.getAddress?.();
    expect(address).toBeTruthy();
    expect(address).toMatch(/^0x[a-f0-9]{40}$/i);
  });

  it('builds a lucid wallet backed by the orchestrator', async () => {
    const fetch = mock(async () => new Response(null, { status: 401 }));
    const handle = createAgentWallet({
      type: 'lucid',
      baseUrl: 'https://lucid.example',
      agentRef: 'agent-123',
      fetch,
      accessToken: 'token',
    });

    expect(handle.kind).toBe('lucid');
    expect(handle.connector).toBeInstanceOf(ServerOrchestratorWalletConnector);
    expect(typeof handle.setAccessToken).toBe('function');
  });

  it('builds a thirdweb wallet from config', () => {
    const handle = createAgentWallet({
      type: 'thirdweb',
      secretKey: 'test-secret-key',
      clientId: 'test-client-id',
      walletLabel: 'test-wallet',
      chainId: 84532, // Base Sepolia
    });

    expect(handle.kind).toBe('thirdweb');
    expect(handle.connector).toBeInstanceOf(ThirdwebWalletConnector);
  });

  it('builds a thirdweb wallet with minimal config', () => {
    const handle = createAgentWallet({
      type: 'thirdweb',
      secretKey: 'test-secret-key',
      walletLabel: 'test-wallet',
      chainId: 84532,
    });

    expect(handle.kind).toBe('thirdweb');
    expect(handle.connector).toBeInstanceOf(ThirdwebWalletConnector);
  });
});
