import { describe, expect, it } from 'bun:test';

import type {
  PublicClientLike,
  WalletClientLike,
} from '../registries/identity';
import { createReputationRegistryClient } from '../registries/reputation';
import type { PublicClientWithReceipt } from '../registries/utils';

const REGISTRY_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

function makeClients() {
  type WriteContractArgs = Parameters<WalletClientLike['writeContract']>[0];
  type ReadContractArgs = Parameters<PublicClientLike['readContract']>[0];
  type ReadContractResult = Awaited<
    ReturnType<PublicClientLike['readContract']>
  >;
  type WaitForTransactionReceiptResult = Awaited<
    ReturnType<
      NonNullable<PublicClientWithReceipt['waitForTransactionReceipt']>
    >
  >;

  let writeArgs: WriteContractArgs | undefined;

  const mockWalletClient: WalletClientLike = {
    account: {
      address: '0x0000000000000000000000000000000000001234' as const,
    },
    async writeContract(args: WriteContractArgs) {
      writeArgs = args;
      return '0xtxhash' as const;
    },
  };

  const mockPublicClient: PublicClientLike & PublicClientWithReceipt = {
    async readContract(args: ReadContractArgs): Promise<ReadContractResult> {
      if (args.functionName === 'readFeedback') {
        return [12n, 2, 'tag-a', 'tag-b', false];
      }
      if (args.functionName === 'getSummary') {
        return [3n, 120n, 2];
      }
      if (args.functionName === 'readAllFeedback') {
        return [
          ['0x0000000000000000000000000000000000001111'],
          [1n],
          [12n],
          [2],
          ['tag-a'],
          ['tag-b'],
          [false],
        ];
      }
      if (args.functionName === 'getClients') {
        return ['0x0000000000000000000000000000000000001111'];
      }
      if (args.functionName === 'getIdentityRegistry') {
        return REGISTRY_ADDRESS;
      }
      if (args.functionName === 'getLastIndex') {
        return 4n;
      }
      if (args.functionName === 'getResponseCount') {
        return 2n;
      }
      if (args.functionName === 'getVersion') {
        return '1.0.0';
      }
      return true;
    },
    async waitForTransactionReceipt(): Promise<WaitForTransactionReceiptResult> {
      return { logs: [] };
    },
  };

  const client = createReputationRegistryClient({
    address: REGISTRY_ADDRESS,
    chainId: 84532,
    publicClient: mockPublicClient,
    walletClient: mockWalletClient,
    identityRegistryAddress: REGISTRY_ADDRESS,
  });

  return { client, getWriteArgs: () => writeArgs };
}

describe('ReputationRegistryClient', () => {
  it('reads feedback value and decimals', async () => {
    const { client } = makeClients();

    const feedback = await client.getFeedback(
      1n,
      '0x0000000000000000000000000000000000001111',
      1n
    );

    expect(feedback?.value).toBe(12n);
    expect(feedback?.valueDecimals).toBe(2);
  });

  it('returns summary with value and decimals', async () => {
    const { client } = makeClients();

    const summary = await client.getSummary(1n);

    expect(summary.count).toBe(3n);
    expect(summary.value).toBe(120n);
    expect(summary.valueDecimals).toBe(2);
  });

  it('sends feedback with value and decimals', async () => {
    const { client, getWriteArgs } = makeClients();

    await client.giveFeedback({
      toAgentId: 1n,
      value: 12n,
      valueDecimals: 2,
      tag1: 'tag-a',
      tag2: 'tag-b',
      endpoint: 'https://agent.example.com',
    });

    const writeArgs = getWriteArgs();
    if (!writeArgs) {
      throw new Error('writeContract was not called');
    }
    expect(writeArgs.functionName).toBe('giveFeedback');
    expect(writeArgs.args?.[1]).toBe(12n);
    expect(writeArgs.args?.[2]).toBe(2);
  });

  it('rejects non-integer value inputs', async () => {
    const { client } = makeClients();

    await expect(
      client.giveFeedback({
        toAgentId: 1n,
        value: 1.5,
      })
    ).rejects.toThrow(/safe integer number/);

    await expect(
      client.giveFeedback({
        toAgentId: 1n,
        value: '1.5',
      })
    ).rejects.toThrow(/value must be a base-10 integer string/);
  });

  it('rejects invalid valueDecimals', async () => {
    const { client } = makeClients();

    await expect(
      client.giveFeedback({
        toAgentId: 1n,
        value: 10,
        valueDecimals: -1,
      })
    ).rejects.toThrow(/valueDecimals must be a non-negative integer/);

    await expect(
      client.giveFeedback({
        toAgentId: 1n,
        value: 10,
        valueDecimals: 1.5,
      })
    ).rejects.toThrow(/valueDecimals must be a non-negative integer/);
  });

  it('reads filtered feedback collections and registry metadata', async () => {
    const { client } = makeClients();
    const clientAddress = '0x0000000000000000000000000000000000001111' as const;

    expect(
      await client.getAllFeedback(1n, {
        clientAddresses: [clientAddress],
        tag1: 'tag-a',
        tag2: 'tag-b',
        includeRevoked: true,
      })
    ).toEqual([
      {
        agentId: 1n,
        clientAddress,
        feedbackIndex: 1n,
        value: 12n,
        valueDecimals: 2,
        tag1: 'tag-a',
        tag2: 'tag-b',
        isRevoked: false,
      },
    ]);
    expect(await client.getClients(1n)).toEqual([clientAddress]);
    expect(await client.getIdentityRegistry()).toBe(REGISTRY_ADDRESS);
    expect(await client.getLastIndex(1n, clientAddress)).toBe(4n);
    expect(
      await client.getResponseCount(1n, clientAddress, 1n, [clientAddress])
    ).toBe(2n);
    expect(await client.getVersion()).toBe('1.0.0');
  });

  it('returns null when a feedback record cannot be read', async () => {
    const publicClient: PublicClientLike = {
      async readContract() {
        throw new Error('missing');
      },
    };
    const client = createReputationRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
      identityRegistryAddress: REGISTRY_ADDRESS,
    });

    expect(
      await client.getFeedback(
        1n,
        '0x0000000000000000000000000000000000001111',
        1n
      )
    ).toBeNull();
  });

  it('writes revocations and responses and waits for confirmation', async () => {
    const { client, getWriteArgs } = makeClients();
    const clientAddress = '0x0000000000000000000000000000000000001111' as const;

    expect(
      await client.revokeFeedback({ agentId: 1n, feedbackIndex: 2n })
    ).toBe('0xtxhash');
    expect(getWriteArgs()?.functionName).toBe('revokeFeedback');
    expect(
      await client.appendResponse({
        agentId: 1n,
        clientAddress,
        feedbackIndex: 2n,
        responseUri: 'https://agent.example.com/response.json',
        responseHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
    ).toBe('0xtxhash');
    expect(getWriteArgs()?.functionName).toBe('appendResponse');
  });

  it('normalizes numeric and string feedback and supplies contract defaults', async () => {
    const { client, getWriteArgs } = makeClients();

    await client.giveFeedback({ toAgentId: 1n, value: ' -12 ' });
    expect(getWriteArgs()?.args).toEqual([
      1n,
      -12n,
      0,
      '',
      '',
      '',
      '',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ]);
    await client.giveFeedback({ toAgentId: 1n, value: 7 });
    expect(getWriteArgs()?.args?.[1]).toBe(7n);
  });

  it('requires a connected wallet for reputation writes', async () => {
    const publicClient: PublicClientLike = {
      async readContract() {
        return true;
      },
    };
    const noWallet = createReputationRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
      identityRegistryAddress: REGISTRY_ADDRESS,
    });
    const noAccount = createReputationRegistryClient<
      PublicClientLike,
      WalletClientLike
    >({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
      walletClient: {
        async writeContract() {
          return '0xtxhash';
        },
      },
      identityRegistryAddress: REGISTRY_ADDRESS,
    });

    await expect(
      noWallet.giveFeedback({ toAgentId: 1n, value: 1n })
    ).rejects.toThrow('Wallet client required');
    await expect(
      noAccount.giveFeedback({ toAgentId: 1n, value: 1n })
    ).rejects.toThrow('Wallet account address is required');
    await expect(
      noWallet.revokeFeedback({ agentId: 1n, feedbackIndex: 1n })
    ).rejects.toThrow('Wallet client required');
    await expect(
      noWallet.appendResponse({
        agentId: 1n,
        clientAddress: '0x0000000000000000000000000000000000001111',
        feedbackIndex: 1n,
        responseUri: '',
        responseHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      })
    ).rejects.toThrow('Wallet client required');
  });
});
