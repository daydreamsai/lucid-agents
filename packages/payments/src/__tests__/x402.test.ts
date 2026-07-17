import { describe, expect, it, spyOn } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import { accountFromPrivateKey, createX402Fetch } from '../x402';

const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

describe('createX402Fetch network registration', () => {
  it('accepts canonical CAIP-2 EVM identifiers', () => {
    expect(() =>
      createX402Fetch({ account, networks: ['eip155:84532'] })
    ).not.toThrow();
  });

  it('rejects unsupported identifiers instead of silently registering nothing', () => {
    expect(() =>
      createX402Fetch({ account, networks: ['solana:mainnet'] })
    ).toThrow('Unsupported EVM payment network');
  });

  it('wraps successful requests for string, URL, and Request inputs', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined);
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response('ok', {
          status: 200,
          headers: { 'PAYMENT-RESPONSE': 'receipt' },
        });
      },
      { preconnect: (_url: string | URL) => undefined }
    ) satisfies typeof fetch;
    const paidFetch = createX402Fetch({ account, fetchImpl });

    expect((await paidFetch('https://example.com/one')).status).toBe(200);
    expect(
      (await paidFetch(new URL('https://example.com/two'), { method: 'GET' }))
        .status
    ).toBe(200);
    expect(
      (
        await paidFetch(
          new Request('https://example.com/three', { method: 'PUT' })
        )
      ).status
    ).toBe(200);
    await paidFetch.preconnect?.();

    expect(calls).toHaveLength(3);
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });

  it('logs and rethrows fetch failures', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined);
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
    const paidFetch = createX402Fetch({
      account,
      networks: ['base-sepolia'],
      fetchImpl: Object.assign(
        async () => {
          throw new Error('offline');
        },
        { preconnect: (_url: string | URL) => undefined }
      ),
    });

    await expect(paidFetch('https://example.com')).rejects.toThrow('offline');
    expect(warning).toHaveBeenCalledWith(
      '[agent-kit-payments:x402] fetch failed',
      'https://example.com',
      'offline'
    );
    warning.mockRestore();
    info.mockRestore();
  });

  it('creates accounts from non-empty private keys', () => {
    const privateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    expect(accountFromPrivateKey(privateKey).address).toBe(account.address);
    expect(() => accountFromPrivateKey('' as `0x${string}`)).toThrow(
      'requires a non-empty private key'
    );
  });
});
