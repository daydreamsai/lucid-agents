import type {
  AgentChallengeResponse,
  TypedDataPayload,
} from '@lucid-agents/types/wallets';
import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { WalletClient } from 'viem';

import { ThirdwebWalletConnector } from '../../connectors/thirdweb-connector';

const account = {
  address: '0x0000000000000000000000000000000000000001' as const,
};
const calls = {
  clients: [] as Array<Record<string, unknown>>,
  messages: [] as unknown[],
  transactions: [] as Array<Record<string, unknown>>,
  typedData: [] as Array<Record<string, unknown>>,
};
let adapterWalletClient: WalletClient | null;
let serverWalletAddress: string | undefined;

const walletClient = {
  account,
  chain: { id: 84532 },
  async signMessage(input: Record<string, unknown>) {
    calls.messages.push(input.message);
    return '0xmessage';
  },
  async signTypedData(input: Record<string, unknown>) {
    calls.typedData.push(input);
    return '0xtyped';
  },
  async signTransaction(input: Record<string, unknown>) {
    calls.transactions.push(input);
    return '0xtransaction';
  },
} as unknown as WalletClient;

mock.module('thirdweb', () => ({
  createThirdwebClient: (options: Record<string, unknown>) => {
    calls.clients.push(options);
    return { options };
  },
  Engine: {
    async createServerWallet() {
      await Promise.resolve();
      return { address: serverWalletAddress };
    },
    serverWallet(input: Record<string, unknown>) {
      return { address: input.address, chain: input.chain };
    },
  },
}));

mock.module('thirdweb/adapters/viem', () => ({
  viemAdapter: {
    wallet: {
      async toViem() {
        return adapterWalletClient;
      },
    },
  },
}));

mock.module('thirdweb/chains', () => ({
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
}));

const challenge: AgentChallengeResponse['challenge'] = {
  id: 'challenge-1',
  credential_id: 'credential-1',
  payload: 'Sign this message',
  payload_hash: '0x1234',
  nonce: 'nonce-1',
  scopes: ['wallet.sign'],
  issued_at: '2024-01-01T00:00:00.000Z',
  expires_at: '2024-01-01T00:05:00.000Z',
  server_signature: '0xserver',
};

const connector = (overrides = {}) =>
  new ThirdwebWalletConnector({
    secretKey: 'secret',
    clientId: 'client',
    walletLabel: 'agent-wallet',
    chainId: 84532,
    caip2: 'eip155:84532',
    ...overrides,
  });

beforeEach(() => {
  adapterWalletClient = walletClient;
  serverWalletAddress = account.address;
  calls.clients.length = 0;
  calls.messages.length = 0;
  calls.transactions.length = 0;
  calls.typedData.length = 0;
});

afterAll(() => {
  mock.restore();
});

describe('ThirdwebWalletConnector', () => {
  it('validates required Engine configuration', () => {
    expect(
      () =>
        new ThirdwebWalletConnector({
          secretKey: '',
          walletLabel: 'wallet',
          chainId: 1,
        })
    ).toThrow('requires a secretKey');
    expect(
      () =>
        new ThirdwebWalletConnector({
          secretKey: 'secret',
          walletLabel: '',
          chainId: 1,
        })
    ).toThrow('requires a walletLabel');
    expect(
      () =>
        new ThirdwebWalletConnector({
          secretKey: 'secret',
          walletLabel: 'wallet',
          chainId: 0,
        })
    ).toThrow('requires a chainId');
  });

  it('initializes once and exposes the Engine wallet capabilities', async () => {
    const subject = connector({
      address: null,
      chain: 'base-sepolia',
      chainType: 'evm',
      label: 'primary',
    });

    const [client, signer] = await Promise.all([
      subject.getWalletClient(),
      subject.getSigner(),
    ]);
    expect(client).toBe(walletClient);
    expect((await subject.getWalletClient()) === walletClient).toBe(true);
    expect(await signer.getAddress?.()).toBe(account.address);
    expect(await subject.getAddress()).toBe(account.address);
    expect(await subject.getWalletMetadata()).toEqual({
      address: account.address,
      caip2: 'eip155:84532',
      chain: 'base-sepolia',
      chainType: 'evm',
      provider: 'thirdweb',
      label: 'primary',
    });
    expect(subject.getCapabilities()).toEqual({
      signer: true,
      walletClient: true,
    });
    expect(calls.clients).toEqual([
      { secretKey: 'secret', clientId: 'client' },
    ]);
  });

  it('signs UTF-8, hex, typed-data, and transaction payloads', async () => {
    const subject = connector();

    expect(await subject.signChallenge(challenge)).toBe('0xmessage');
    expect(
      await subject.signChallenge({ ...challenge, payload: '0xdeadbeef' })
    ).toBe('0xmessage');
    const typedData: TypedDataPayload = {
      primaryType: 'Mail',
      types: { Mail: [{ name: 'body', type: 'string' }] },
      domain: { name: 'Agent' },
      message: { body: 'hello' },
    };
    expect(
      await subject.signChallenge({
        ...challenge,
        payload: { typedData },
      })
    ).toBe('0xtyped');

    const signer = await subject.getSigner();
    expect(
      await signer.signTransaction?.({
        to: account.address,
        value: 1n,
        data: '0x12',
        gas: 21_000n,
        gasPrice: 2n,
        nonce: 3,
      })
    ).toBe('0xtransaction');
    expect(calls.messages[0]).toBe('Sign this message');
    expect((calls.messages[1] as { raw: Uint8Array }).raw).toBeInstanceOf(
      Uint8Array
    );
    expect(calls.typedData[0]?.primaryType).toBe('Mail');
    expect(calls.transactions[0]?.account).toBe(account);
  });

  it('checks CAIP-2 support with and without configured metadata', () => {
    const scoped = connector();
    const unscoped = connector({ caip2: null });

    expect(scoped.supportsCaip2('')).toBe(false);
    expect(scoped.supportsCaip2('EIP155:84532')).toBe(true);
    expect(scoped.supportsCaip2('eip155:1')).toBe(false);
    expect(unscoped.supportsCaip2('eip155:1')).toBe(true);
  });

  it('rejects unsupported chains and missing adapter clients', async () => {
    await expect(connector({ chainId: 999 }).getWalletClient()).rejects.toThrow(
      'Chain with ID 999 not found'
    );

    adapterWalletClient = null;
    await expect(connector().getWalletClient()).rejects.toThrow(
      'Thirdweb did not return a viem wallet client'
    );
  });

  it('keeps configured metadata when lazy initialization fails', async () => {
    const subject = connector({
      chainId: 999,
      address: '0xconfigured',
    });

    expect(await subject.getAddress()).toBe('0xconfigured');
    expect(await subject.getWalletMetadata()).toEqual(
      expect.objectContaining({ address: '0xconfigured' })
    );
  });

  it('rejects challenges without a signable payload', async () => {
    const subject = connector();
    await expect(
      subject.signChallenge({
        ...challenge,
        payload: {},
        payload_hash: null,
      })
    ).rejects.toThrow('does not include a signable message');
  });
});
