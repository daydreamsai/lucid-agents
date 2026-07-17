import { afterEach, describe, expect, it, mock } from 'bun:test';

import { LocalEoaWalletConnector } from '../../connectors/local-eoa-connector';
import { ServerOrchestratorWalletConnector } from '../../connectors/server-orchestrator-connector';
import { ThirdwebWalletConnector } from '../../connectors/thirdweb-connector';
import { ViemWalletConnector } from '../../connectors/viem-wallet-connector';
import {
  createAgentWallet,
  createDeveloperWallet,
  createWalletsRuntime,
} from '../../runtime';
import { wallets } from '../../extension';

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

  it('builds agent and developer signer wallets', () => {
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000001',
      },
    } as never;

    const agent = createAgentWallet({
      type: 'signer',
      walletClient,
      provider: 'browser',
    });
    const developer = createDeveloperWallet({
      type: 'signer',
      walletClient,
      label: 'developer',
    });

    expect(agent.kind).toBe('signer');
    expect(agent.connector).toBeInstanceOf(ViemWalletConnector);
    expect(developer.kind).toBe('local');
    expect(developer.connector).toBeInstanceOf(ViemWalletConnector);
  });

  it('builds a local developer wallet and validates invalid configs', () => {
    const developer = createDeveloperWallet({
      type: 'local',
      privateKey:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    expect(developer.kind).toBe('local');
    expect(developer.connector).toBeInstanceOf(LocalEoaWalletConnector);
    expect(() => createDeveloperWallet({ type: 'local' } as never)).toThrow(
      'requires a privateKey'
    );
    expect(() => createDeveloperWallet({ type: 'thirdweb' } as never)).toThrow(
      'must be local or signer'
    );
  });

  it('creates optional combined wallet runtimes', () => {
    expect(createWalletsRuntime(undefined)).toBeUndefined();

    const runtime = createWalletsRuntime({
      agent: {
        type: 'local',
        privateKey:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      developer: {
        type: 'local',
        privateKey:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    });

    expect(runtime?.agent?.kind).toBe('local');
    expect(runtime?.developer?.kind).toBe('local');
  });

  it('exposes wallet runtime creation through the extension contract', async () => {
    const extension = wallets({
      config: {
        agent: {
          type: 'local',
          privateKey:
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    });
    const slice = await extension.build({} as never);

    expect(extension.name).toBe('wallets');
    expect(slice.wallets?.agent?.kind).toBe('local');
  });
});
