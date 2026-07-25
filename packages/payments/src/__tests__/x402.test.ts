import { describe, expect, it, spyOn } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';
import type {
  BatchSettlementClientContext,
  ClientChannelStorage,
} from '@x402/evm/batch-settlement/client';

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

  it('preserves a POST Request body when retrying with payment', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined);
    const bodies: string[] = [];
    const signatures: Array<string | null> = [];
    const fetchImpl = Object.assign(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        const received = new Request(request, init);
        bodies.push(await received.text());
        signatures.push(received.headers.get('PAYMENT-SIGNATURE'));

        if (signatures.length === 1) {
          return new Response(null, {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
                x402Version: 2,
                accepts: [
                  {
                    scheme: 'exact',
                    network: 'eip155:84532',
                    amount: '1000',
                    payTo: account.address,
                    maxTimeoutSeconds: 300,
                    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7c',
                    extra: { name: 'USDC', version: '2' },
                  },
                ],
                resource: {
                  url: 'https://example.com/paid',
                  description: 'Paid JSON endpoint',
                  mimeType: 'application/json',
                },
              }),
            },
          });
        }

        return new Response('paid', { status: 200 });
      },
      { preconnect: (_url: string | URL) => undefined }
    ) satisfies typeof fetch;
    const paidFetch = createX402Fetch({
      account,
      networks: ['base-sepolia'],
      fetchImpl,
    });
    const body = JSON.stringify({ prompt: 'preserve this body' });

    const response = await paidFetch(
      new Request('https://example.com/paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    );

    expect(response.status).toBe(200);
    expect(bodies).toEqual([body, body]);
    expect(signatures[0]).toBeNull();
    expect(signatures[1]).toBeTruthy();
    info.mockRestore();
  });

  it('registers the released EVM upto buyer and signs its ceiling', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined);
    const signatures: Array<string | null> = [];
    const fetchImpl = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const received = new Request(input, init);
        signatures.push(received.headers.get('PAYMENT-SIGNATURE'));
        if (signatures.length === 1) {
          return new Response(null, {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
                x402Version: 2,
                accepts: [
                  {
                    scheme: 'upto',
                    network: 'eip155:84532',
                    amount: '1000',
                    payTo: account.address,
                    maxTimeoutSeconds: 300,
                    asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7c',
                    extra: {
                      name: 'USDC',
                      version: '2',
                      assetTransferMethod: 'permit2',
                      facilitatorAddress:
                        '0x0000000000000000000000000000000000000001',
                    },
                  },
                ],
                resource: {
                  url: 'https://example.com/metered',
                  description: 'Metered endpoint',
                  mimeType: 'application/json',
                },
              }),
            },
          });
        }
        return new Response('paid', { status: 200 });
      },
      { preconnect: (_url: string | URL) => undefined }
    ) satisfies typeof fetch;
    const paidFetch = createX402Fetch({
      account,
      networks: ['base-sepolia'],
      fetchImpl,
    });

    expect((await paidFetch('https://example.com/metered')).status).toBe(200);
    expect(signatures[0]).toBeNull();
    expect(signatures[1]).toBeTruthy();
    info.mockRestore();
  });

  it('continues cumulative vouchers across buyer restarts with injected storage', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => undefined);
    const channels = new Map<string, BatchSettlementClientContext>();
    const storage: ClientChannelStorage = {
      get: async key => channels.get(key),
      set: async (key, value) => {
        channels.set(key, structuredClone(value));
      },
      delete: async key => {
        channels.delete(key);
      },
    };
    const payloads: Array<Record<string, unknown>> = [];
    const requirements = {
      scheme: 'batch-settlement',
      network: 'eip155:84532' as const,
      amount: '1000',
      payTo: '0x0000000000000000000000000000000000000001',
      maxTimeoutSeconds: 300,
      asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7c',
      extra: {
        name: 'USDC',
        version: '2',
        receiverAuthorizer: '0x0000000000000000000000000000000000000002',
        withdrawDelay: 900,
      },
    };
    const paymentRequired = () =>
      new Response(null, {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
            x402Version: 2,
            accepts: [requirements],
            resource: {
              url: 'https://example.com/batched',
              description: 'Batched endpoint',
              mimeType: 'application/json',
            },
          }),
        },
      });
    const fetchImpl = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const signature = request.headers.get('PAYMENT-SIGNATURE');
        if (!signature) return paymentRequired();

        const decoded = decodePaymentSignatureHeader(signature);
        payloads.push(decoded.payload);
        const voucher = decoded.payload.voucher as {
          channelId: string;
          maxClaimableAmount: string;
        };
        return new Response('paid', {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': encodePaymentResponseHeader({
              success: true,
              payer: account.address,
              transaction: `0x${'12'.repeat(32)}`,
              network: 'eip155:84532',
              amount: requirements.amount,
              extra: {
                channelState: {
                  channelId: voucher.channelId,
                  chargedCumulativeAmount: voucher.maxClaimableAmount,
                  balance: '5000',
                  totalClaimed: '0',
                },
              },
            }),
          },
        });
      },
      { preconnect: (_url: string | URL) => undefined }
    ) satisfies typeof fetch;

    const firstProcess = createX402Fetch({
      account,
      networks: ['base-sepolia'],
      fetchImpl,
      batchSettlement: { storage },
    });
    expect(firstProcess.refundBatchChannel).toBeFunction();
    expect((await firstProcess('https://example.com/batched')).status).toBe(
      200
    );

    const restartedProcess = createX402Fetch({
      account,
      networks: ['base-sepolia'],
      fetchImpl,
      batchSettlement: { storage },
    });
    expect((await restartedProcess('https://example.com/batched')).status).toBe(
      200
    );

    expect(payloads.map(payload => payload.type)).toEqual([
      'deposit',
      'voucher',
    ]);
    expect(
      (payloads[1]!.voucher as { maxClaimableAmount: string })
        .maxClaimableAmount
    ).toBe('2000');
    expect(channels.size).toBe(1);
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
