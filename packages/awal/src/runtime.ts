import type {
  AwalBalanceResult,
  AwalConfig,
  AwalRuntime,
  AwalTradeResult,
  PayX402RequestOptions,
  SendOptions,
  TradeOptions,
} from '@lucid-agents/types/awal';

import { createCliTransport } from './transport/cli';

const toHeadersRecord = (headers?: HeadersInit): Record<string, string> | undefined => {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
};

const toRequestBodyPayload = async (
  body: BodyInit | null | undefined
): Promise<{ body?: string; bodyEncoding?: 'utf8' | 'base64' }> => {
  if (body === null || body === undefined) {
    return {};
  }

  if (typeof body === 'string') {
    return { body, bodyEncoding: 'utf8' };
  }

  if (body instanceof URLSearchParams) {
    return { body: body.toString(), bodyEncoding: 'utf8' };
  }

  if (body instanceof FormData) {
    throw new Error('[awal] FormData request bodies are not supported for CLI transport');
  }

  if (body instanceof Blob) {
    const buffer = Buffer.from(await body.arrayBuffer());
    return { body: buffer.toString('base64'), bodyEncoding: 'base64' };
  }

  if (body instanceof ArrayBuffer) {
    return { body: Buffer.from(body).toString('base64'), bodyEncoding: 'base64' };
  }

  if (ArrayBuffer.isView(body)) {
    const view = body as ArrayBufferView;
    return {
      body: Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64'),
      bodyEncoding: 'base64',
    };
  }

  return { body: String(body), bodyEncoding: 'utf8' };
};

const toRequestPayload = async (
  url: string,
  options?: PayX402RequestOptions
): Promise<Record<string, unknown>> => {
  const bodyPayload = await toRequestBodyPayload(options?.body ?? null);
  return {
    url,
    method: options?.method ?? 'GET',
    headers: toHeadersRecord(options?.headers),
    ...bodyPayload,
  };
};

export function createAwalRuntime(config: AwalConfig): AwalRuntime {
  const cliTransport = createCliTransport(
    config.transport?.type === 'cli' ? config.transport : { type: 'cli' }
  );

  return {
    config,
    async payX402Request(url: string, options?: PayX402RequestOptions): Promise<Response> {
      const payload = await toRequestPayload(url, options);
      const result = await cliTransport.invoke({
        action: 'make-x402-request',
        payload,
        timeoutMs: options?.timeoutMs,
      });

      const responseData = (result.data ?? {}) as {
        status?: number;
        headers?: Record<string, string>;
        body?: unknown;
      };

      const status =
        typeof responseData.status === 'number' ? responseData.status : 200;

      const headers = new Headers(responseData.headers ?? {});
      let body: BodyInit | null = null;

      if (typeof responseData.body === 'string') {
        body = responseData.body;
      } else if (responseData.body !== undefined) {
        headers.set('content-type', headers.get('content-type') ?? 'application/json');
        body = JSON.stringify(responseData.body);
      }

      return new Response(body, { status, headers });
    },
    async send(amount: string, recipient: string, options?: SendOptions) {
      const result = await cliTransport.invoke({
        action: 'send',
        payload: {
          amount,
          recipient,
          asset: options?.asset,
          network: options?.network,
          memo: options?.memo,
        },
      });

      return {
        ok: result.success,
        raw: result.data,
      };
    },
    async balance(): Promise<AwalBalanceResult> {
      const result = await cliTransport.invoke({
        action: 'balance',
      });

      return {
        raw: result.data,
      };
    },
    async trade(amount: string, from: string, to: string, options?: TradeOptions): Promise<AwalTradeResult> {
      const result = await cliTransport.invoke({
        action: 'trade',
        payload: {
          amount,
          from,
          to,
          slippageBps: options?.slippageBps,
          network: options?.network,
        },
      });

      return {
        ok: result.success,
        raw: result.data,
      };
    },
    async getWalletMetadata() {
      const result = await cliTransport.invoke({
        action: 'wallet-metadata',
      });

      const metadata = (result.data ?? {}) as {
        address?: string;
        network?: string;
        accountId?: string;
      };

      return {
        address: metadata.address ?? null,
        network: metadata.network ?? null,
        accountId: metadata.accountId ?? null,
        raw: result.data,
      };
    },
  };
}
