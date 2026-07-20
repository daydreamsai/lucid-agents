import { afterEach, describe, expect, it } from 'bun:test';
import { createServicePayloadExample } from '@lucid-agents/http';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import {
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import type { Transaction } from '@solana/kit';

import {
  cancelServiceTask,
  createSolanaSigner,
  createServiceTask,
  getServiceTask,
  invokeServiceOperation,
  paymentNetworkMismatch,
  ServiceRequestError,
  streamServiceOperation,
} from '../adapters/ui/src/lib/service-client';
import {
  integrationSnippet,
  offeringPriceLabel,
} from '../adapters/ui/src/lib/service-utils';

const originalFetch = globalThis.fetch;

function setFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) {
  globalThis.fetch = handler as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('generated service UI helpers', () => {
  it('creates stable schema examples, price labels, and integration snippets', () => {
    const payload = createServicePayloadExample({
      type: 'object',
      required: ['topic', 'limit'],
      properties: {
        topic: { type: 'string', description: 'research topic' },
        limit: { type: 'integer', minimum: 2 },
        optional: { type: 'boolean' },
      },
    });

    expect(payload).toBe(
      JSON.stringify(
        { input: { topic: '<research topic>', limit: 2 } },
        null,
        2
      )
    );
    expect(offeringPriceLabel('$0.10', '$0.20')).toBe(
      '$0.10 invoke · $0.20 stream'
    );
    expect(offeringPriceLabel()).toBe('Free');
    expect(
      integrationSnippet('/api/agent/entrypoints/research/invoke', payload)
    ).toContain("-H 'Content-Type: application/json'");
  });

  it('invokes JSON services and preserves structured HTTP errors', async () => {
    const requests: Request[] = [];
    setFetch(async (input, init) => {
      requests.push(new Request(input, init));
      if (requests.length === 1) {
        return Response.json({ output: { answer: 'done' } });
      }
      return Response.json(
        { error: { code: 'payment_required', message: 'Payment required' } },
        {
          status: 402,
          headers: { 'Payment-Authenticate': 'Payment challenge-value' },
        }
      );
    });

    await expect(
      invokeServiceOperation({
        url: 'https://agent.example/invoke',
        body: { input: { topic: 'agents' } },
        request: {},
      })
    ).resolves.toEqual({ output: { answer: 'done' } });
    expect(await requests[0]?.json()).toEqual({ input: { topic: 'agents' } });

    const error = await invokeServiceOperation({
      url: 'https://agent.example/invoke',
      body: {},
      request: {},
    }).catch(value => value as ServiceRequestError);
    expect(error).toBeInstanceOf(ServiceRequestError);
    expect(error).toMatchObject({
      status: 402,
      code: 'payment_required',
      challenge: 'Payment challenge-value',
      message: 'Payment required',
    });
  });

  it('signs and retries auth-only SIWX challenges', async () => {
    const requests: Request[] = [];
    setFetch(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (requests.length === 1) {
        return Response.json(
          {
            error: {
              siwx: {
                domain: 'agent.example',
                uri: 'https://agent.example/invoke',
                version: '1',
                nonce: 'auth-only',
                issuedAt: '2026-07-20T00:00:00.000Z',
              },
            },
          },
          { status: 401 }
        );
      }
      return Response.json({ output: { authorized: true } });
    });

    const result = await invokeServiceOperation({
      url: 'https://agent.example/invoke',
      body: { input: {} },
      request: {
        siwxNetwork: 'eip155:8453',
        useSIWx: true,
        walletClient: {
          account: { address: '0x1234567890abcdef1234567890abcdef12345678' },
          chain: { id: 8453 },
          signMessage: async () => '0xsigned',
        },
      },
    });

    expect(result).toEqual({ output: { authorized: true } });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.headers.has('SIGN-IN-WITH-X')).toBe(true);
    const encoded = requests[1]?.headers.get('SIGN-IN-WITH-X');
    expect(encoded).toBeTruthy();
    expect(
      JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8')).chainId
    ).toBe('eip155:8453');
  });

  it('reports advertised wallet network mismatches before signing', () => {
    expect(
      paymentNetworkMismatch('eip155:8453', { evmChainId: 84532 })
    ).toContain('eip155:8453');
    expect(
      paymentNetworkMismatch('solana:mainnet', {
        solanaNetwork: 'solana:devnet',
      })
    ).toContain('solana:mainnet');
    expect(
      paymentNetworkMismatch('eip155:8453', { evmChainId: 8453 })
    ).toBeUndefined();
    expect(paymentNetworkMismatch('cosmos:cosmoshub-4', {})).toContain(
      'does not support'
    );
  });

  it('adapts Solana providers and rejects unsigned payment transactions', async () => {
    const payer = Keypair.generate();
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
      instructions: [],
    }).compileToV0Message();
    const transaction = {
      messageBytes: message.serialize(),
      signatures: { [payer.publicKey.toBase58()]: null },
    } as unknown as Transaction;

    const signer = await createSolanaSigner({
      address: payer.publicKey.toBase58(),
      network: 'solana:devnet',
      provider: {
        signTransaction: candidate => {
          if (!(candidate instanceof VersionedTransaction)) {
            throw new Error('Expected a versioned transaction');
          }
          candidate.sign([payer]);
          return Promise.resolve(candidate);
        },
      },
    });

    const dictionaries = await signer!.signTransactions([transaction] as never);
    const signature = dictionaries[0]?.[payer.publicKey.toBase58()];
    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature?.some(byte => byte !== 0)).toBe(true);

    const unsignedSigner = await createSolanaSigner({
      address: payer.publicKey.toBase58(),
      provider: {
        signTransaction: candidate => Promise.resolve(candidate),
      },
    });
    await expect(
      unsignedSigner!.signTransactions([transaction] as never)
    ).rejects.toThrow('did not sign');
    await expect(
      createSolanaSigner({ address: 'not-a-solana-address' })
    ).resolves.toBeUndefined();
  });

  it('signs and retries advertised EVM x402 challenges', async () => {
    const requests: Request[] = [];
    let signed = false;
    const paymentRequired = encodePaymentRequiredHeader({
      x402Version: 2,
      resource: {
        url: 'https://agent.example/invoke',
        description: 'Protected operation',
        mimeType: 'application/json',
      },
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          asset: '0x0000000000000000000000000000000000000001',
          amount: '1000',
          payTo: '0x0000000000000000000000000000000000000002',
          maxTimeoutSeconds: 60,
          extra: { name: 'USD Coin', version: '2' },
        },
      ],
    });
    setFetch(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (requests.length === 1) {
        return new Response(null, {
          status: 402,
          headers: { 'PAYMENT-REQUIRED': paymentRequired },
        });
      }
      return Response.json({ output: { paid: true } });
    });

    const result = await invokeServiceOperation({
      url: 'https://agent.example/invoke',
      body: { input: {} },
      request: {
        network: 'eip155:8453',
        useX402: true,
        walletClient: {
          account: { address: '0x1234567890abcdef1234567890abcdef12345678' },
          chain: { id: 8453 },
          signTypedData: async () => {
            signed = true;
            return `0x${'01'.repeat(65)}`;
          },
        },
      },
    });

    expect(result).toEqual({ output: { paid: true } });
    expect(signed).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.headers.has('PAYMENT-SIGNATURE')).toBe(true);
  });

  it('parses CRLF and multiline SSE events and supports cancellation', async () => {
    const encoder = new TextEncoder();
    setFetch(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"kind":"text","text":"first"}\r\n\r\n' +
                    'data: {"kind":"delta",\r\n' +
                    'data: "delta":" second"}\r\n\r\n' +
                    'data: [DONE]\r\n\r\n'
                )
              );
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } }
        )
    );

    const chunks: unknown[] = [];
    await new Promise<void>(async (resolve, reject) => {
      const stream = await streamServiceOperation({
        url: '/stream',
        body: {},
        request: {},
        onChunk: chunk => chunks.push(chunk),
        onDone: resolve,
        onError: reject,
      });
      expect(typeof stream.cancel).toBe('function');
    });

    expect(chunks).toEqual([
      { kind: 'text', text: 'first' },
      { kind: 'delta', delta: ' second' },
    ]);
  });

  it('creates, reads, and cancels A2A tasks without exposing access tokens', async () => {
    const requests: Request[] = [];
    setFetch(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === 'POST' && request.url.endsWith('/tasks')) {
        return Response.json({
          taskId: 'task-42',
          accessToken: 'private-access-token-value',
          status: 'running',
        });
      }
      if (request.method === 'POST')
        return Response.json({ status: 'cancelled' });
      return Response.json({
        taskId: 'task-42',
        status: 'completed',
        result: { output: { answer: 'done' } },
      });
    });

    const task = await createServiceTask({
      url: 'https://agent.example/tasks',
      skillId: 'research',
      input: { topic: 'agents' },
      request: {},
    });
    expect(task.taskId).toBe('task-42');
    expect(await requests[0]?.json()).toEqual({
      skillId: 'research',
      message: {
        role: 'user',
        content: { text: '{"topic":"agents"}' },
      },
    });

    await expect(
      getServiceTask({
        tasksUrl: 'https://agent.example/tasks',
        taskId: task.taskId,
        accessToken: task.accessToken,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    await cancelServiceTask({
      tasksUrl: 'https://agent.example/tasks',
      taskId: task.taskId,
      accessToken: task.accessToken,
    });
    expect(requests[1]?.headers.get('Task-Access-Token')).toBe(
      'private-access-token-value'
    );
    expect(requests[2]?.url).toEndWith('/tasks/task-42/cancel');
  });
});
