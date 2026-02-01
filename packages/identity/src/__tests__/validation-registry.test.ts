import { describe, expect, it } from 'bun:test';

import type { PublicClientLike, WalletClientLike } from '../registries/identity';
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

  const mockPublicClient = {
    async readContract() {
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
});
