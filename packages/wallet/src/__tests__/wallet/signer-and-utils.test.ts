import { describe, expect, it } from 'bun:test';
import { createWalletClient, custom } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { createSignerConnector } from '../../connectors/signer-connector';
import {
  normalizeAddress,
  sanitizeAddress,
  toCaip10,
  ZERO_ADDRESS,
} from '../../utils/address';
import {
  signMessageWithViem,
  signTypedDataWithViem,
  type SignerWalletClient,
} from '../../utils/signatures';

const ADDRESS = '0x1234567890AbcdEF1234567890aBcdef12345678';
const PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('createSignerConnector', () => {
  it('delegates supported signing methods and prefers a declared address', async () => {
    const typedPayload = {
      domain: {},
      primaryType: 'Message',
      types: { Message: [{ name: 'value', type: 'string' }] },
      message: { value: 'hello' },
    };
    const transaction = { to: normalizeAddress(ADDRESS), value: 1n };
    const signer = createSignerConnector({
      address: ADDRESS,
      signMessage: async () => '0xaaaa',
      signTypedData: async payload =>
        payload === typedPayload ? '0xbbbb' : '0xdead',
      signTransaction: async payload =>
        payload === transaction ? '0x1234' : '0xdead',
    });

    expect(await signer.signMessage!('hello')).toBe('0xaaaa');
    expect(await signer.signTypedData!(typedPayload)).toBe('0xbbbb');
    expect(await signer.signTransaction!(transaction)).toBe('0x1234');
    expect(await signer.getAddress!()).toBe(ADDRESS);
  });

  it('resolves optional addresses and fails closed when capabilities are absent', async () => {
    const signer = createSignerConnector({
      getAddress: async () => '',
      signMessage: async () => 'signature',
    });
    const rejectedAddress = createSignerConnector({
      getAddress: async () => {
        throw new Error('wallet unavailable');
      },
      signMessage: async () => 'signature',
    });

    expect(await signer.getAddress!()).toBeNull();
    expect(await rejectedAddress.getAddress!()).toBeNull();
    await expect(
      signer.signTypedData!({
        domain: {},
        primaryType: 'Message',
        types: {},
        message: {},
      })
    ).rejects.toThrow('does not support typed data');
    await expect(signer.signTransaction!({})).rejects.toThrow(
      'does not support transaction signing'
    );
    expect(() =>
      createSignerConnector({ signMessage: undefined } as never)
    ).toThrow('must implement signMessage');
  });
});

describe('wallet address helpers', () => {
  it('normalizes addresses and creates default and custom CAIP-10 identifiers', () => {
    const normalized = normalizeAddress(`  ${ADDRESS}  `);

    expect(normalized).toBe(normalizeAddress(ADDRESS));
    expect(toCaip10({ chainId: 8453, address: ADDRESS })).toBe(
      `eip155:8453:${normalized}`
    );
    expect(
      toCaip10({ namespace: 'example', chainId: 'network', address: ADDRESS })
    ).toBe(`example:network:${normalized}`);
  });

  it('rejects malformed inputs and sanitizes them to the zero address', () => {
    expect(() => normalizeAddress(undefined)).toThrow('invalid hex address');
    expect(() => normalizeAddress('0x1234')).toThrow('invalid hex address');
    expect(() => toCaip10({ chainId: '', address: ADDRESS })).toThrow(
      'chainId is required'
    );
    expect(sanitizeAddress(null)).toBe(ZERO_ADDRESS);
    expect(sanitizeAddress('not-an-address')).toBe(ZERO_ADDRESS);
    expect(sanitizeAddress(ADDRESS)).toBe(normalizeAddress(ADDRESS));
  });
});

describe('viem signature helpers', () => {
  it('uses local account signing for messages and typed data', async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const client = createWalletClient({
      account,
      transport: custom({ request: async () => null }),
    }) as SignerWalletClient;

    const messageSignature = await signMessageWithViem(client, 'hello');
    const typedSignature = await signTypedDataWithViem(client, {
      domain: {
        name: 'Lucid',
        version: '1',
        chainId: 1,
        verifyingContract: ZERO_ADDRESS,
      },
      types: {
        Message: [{ name: 'value', type: 'string' }],
      },
      primaryType: 'Message',
      message: { value: 'hello' },
    });

    expect(messageSignature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(typedSignature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it('falls back to the JSON-RPC signing action for remote accounts', async () => {
    const signature = `0x${'ab'.repeat(65)}` as `0x${string}`;
    const requests: Array<{ method: string; params?: readonly unknown[] }> = [];
    const client = createWalletClient({
      account: normalizeAddress(ADDRESS),
      transport: custom({
        request: async request => {
          requests.push(request as (typeof requests)[number]);
          return signature;
        },
      }),
    }) as SignerWalletClient;

    expect(await signMessageWithViem(client, 'hello')).toBe(signature);
    expect(requests[0]?.method).toBe('personal_sign');
  });
});
