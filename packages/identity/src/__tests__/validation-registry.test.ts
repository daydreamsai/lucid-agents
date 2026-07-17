import { describe, expect, it } from 'bun:test';

import type {
  PublicClientLike,
  WalletClientLike,
} from '../registries/identity';
import { hashValidationRequest } from '../registries/signatures';
import { createValidationRegistryClient } from '../registries/validation';

const REGISTRY_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

function makeClients() {
  let writeArgs: any;

  const mockWalletClient = {
    account: {
      address: '0x0000000000000000000000000000000000001234' as const,
    },
    async writeContract(args: any) {
      writeArgs = args;
      return '0xtxhash' as const;
    },
  } as WalletClientLike;

  const requestHash =
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
  const mockPublicClient = {
    async readContract({ functionName }: { functionName: string }) {
      if (functionName === 'getIdentityRegistry') return REGISTRY_ADDRESS;
      if (functionName === 'getValidationStatus') {
        return [
          '0x000000000000000000000000000000000000beef',
          1n,
          2,
          requestHash,
          'quality',
          123n,
        ];
      }
      if (functionName === 'getAgentValidations') return [requestHash];
      if (functionName === 'getValidatorRequests') return [requestHash];
      if (functionName === 'getSummary') return [3n, 2];
      if (functionName === 'getVersion') return '1.0.0';
      return true;
    },
    async waitForTransactionReceipt() {
      return { logs: [] };
    },
  } as any as PublicClientLike;

  const client = createValidationRegistryClient({
    address: REGISTRY_ADDRESS,
    chainId: 84532,
    publicClient: mockPublicClient,
    walletClient: mockWalletClient,
    identityRegistryAddress: REGISTRY_ADDRESS,
  });

  return { client, getWriteArgs: () => writeArgs };
}

describe('ValidationRegistryClient.validationRequest', () => {
  it('hashes requestUri when requestBody is missing', async () => {
    const { client, getWriteArgs } = makeClients();

    const requestUri = 'https://example.com/validation/request.json';
    await client.validationRequest({
      validatorAddress: '0x000000000000000000000000000000000000beef',
      agentId: 1n,
      requestUri,
    });

    const writeArgs = getWriteArgs();
    expect(writeArgs.functionName).toBe('validationRequest');
    expect(writeArgs.args?.[3]).toBe(hashValidationRequest(requestUri));
  });

  it('hashes requestBody when provided', async () => {
    const { client, getWriteArgs } = makeClients();

    const requestBody = '{"input":"test"}';
    await client.validationRequest({
      validatorAddress: '0x000000000000000000000000000000000000beef',
      agentId: 1n,
      requestUri: 'https://example.com/validation/request.json',
      requestBody,
    });

    const writeArgs = getWriteArgs();
    expect(writeArgs.functionName).toBe('validationRequest');
    expect(writeArgs.args?.[3]).toBe(hashValidationRequest(requestBody));
  });

  it('uses an explicitly supplied request hash', async () => {
    const { client, getWriteArgs } = makeClients();
    const requestHash =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

    await client.validationRequest({
      validatorAddress: '0x000000000000000000000000000000000000beef',
      agentId: 1n,
      requestUri: 'https://example.com/validation/request.json',
      requestHash,
    });

    expect(getWriteArgs().args?.[3]).toBe(requestHash);
  });

  it('reads validation state, indexes, summaries, and registry metadata', async () => {
    const { client } = makeClients();
    const requestHash =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
    const validator = '0x000000000000000000000000000000000000beef' as const;

    expect(await client.getIdentityRegistry()).toBe(REGISTRY_ADDRESS);
    expect(await client.getValidationStatus(requestHash)).toEqual({
      validatorAddress: validator,
      agentId: 1n,
      response: 2,
      responseHash: requestHash,
      tag: 'quality',
      lastUpdate: 123n,
    });
    expect(await client.getAgentValidations(1n)).toEqual([requestHash]);
    expect(await client.getValidatorRequests(validator)).toEqual([requestHash]);
    expect(
      await client.getSummary(1n, {
        validatorAddresses: [validator],
        tag: 'quality',
      })
    ).toEqual({ count: 3n, avgResponse: 2 });
    expect(await client.getVersion()).toBe('1.0.0');
  });

  it('returns null for missing and unreadable validation requests', async () => {
    const requestHash =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
    const missing = createValidationRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: {
        async readContract() {
          return [
            '0x0000000000000000000000000000000000000000',
            0n,
            0,
            requestHash,
            '',
            0n,
          ];
        },
      } as PublicClientLike,
      identityRegistryAddress: REGISTRY_ADDRESS,
    });
    const unreadable = createValidationRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: {
        async readContract() {
          throw new Error('missing');
        },
      } as PublicClientLike,
      identityRegistryAddress: REGISTRY_ADDRESS,
    });

    expect(await missing.getValidationStatus(requestHash)).toBeNull();
    expect(await unreadable.getValidationStatus(requestHash)).toBeNull();
  });

  it('submits validation responses with default and explicit tags', async () => {
    const { client, getWriteArgs } = makeClients();
    const requestHash =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
    const responseHash =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;

    expect(
      await client.validationResponse({
        requestHash,
        response: 1,
        responseUri: 'https://example.com/response.json',
        responseHash,
      })
    ).toBe('0xtxhash');
    expect(getWriteArgs().args?.[4]).toBe('');
    await client.validationResponse({
      requestHash,
      response: 2,
      responseUri: 'https://example.com/response.json',
      responseHash,
      tag: 'quality',
    });
    expect(getWriteArgs().args?.[4]).toBe('quality');
  });

  it('requires a wallet for validation writes', async () => {
    const client = createValidationRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: {
        async readContract() {
          return true;
        },
      } as PublicClientLike,
      identityRegistryAddress: REGISTRY_ADDRESS,
    });
    const requestHash =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;

    await expect(
      client.validationRequest({
        validatorAddress: '0x000000000000000000000000000000000000beef',
        agentId: 1n,
        requestUri: 'https://example.com/request.json',
      })
    ).rejects.toThrow('Wallet client required');
    await expect(
      client.validationResponse({
        requestHash,
        response: 1,
        responseUri: '',
        responseHash: requestHash,
      })
    ).rejects.toThrow('Wallet client required');
  });
});
