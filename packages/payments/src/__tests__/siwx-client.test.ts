import { describe, expect, it } from 'bun:test';
import {
  parseSIWxExtension,
  buildSIWxHeaderValue,
  wrapFetchWithSIWx,
  hasSIWxExtension,
} from '../siwx-client';
import type { SIWxSigner } from '../siwx-client';

describe('SIWX Client', () => {
  describe('hasSIWxExtension', () => {
    it('should return true when X-SIWX-EXTENSION header is present', async () => {
      const response = new Response('{}', {
        status: 402,
        headers: { 'X-SIWX-EXTENSION': 'some-value' },
      });
      expect(await hasSIWxExtension(response)).toBe(true);
    });

    it('should return true when SIWX extension is in response body', async () => {
      const response = new Response(
        JSON.stringify({ error: { siwx: { scheme: 'sign-in-with-x' } } }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
      expect(await hasSIWxExtension(response)).toBe(true);
    });

    it('should return false when no SIWX extension is present', async () => {
      const response = new Response(
        JSON.stringify({ error: 'payment_required' }),
        { status: 402 }
      );
      expect(await hasSIWxExtension(response)).toBe(false);
    });
  });

  describe('parseSIWxExtension', () => {
    it('should parse SIWX extension from X-SIWX-EXTENSION header', async () => {
      const ext = {
        scheme: 'sign-in-with-x',
        domain: 'test.com',
        nonce: 'abc',
      };
      const response = new Response('{}', {
        status: 402,
        headers: {
          'X-SIWX-EXTENSION': Buffer.from(JSON.stringify(ext)).toString(
            'base64'
          ),
        },
      });
      const result = await parseSIWxExtension(response);
      expect(result).toEqual(ext);
    });

    it('should parse SIWX extension from response body error.siwx', async () => {
      const ext = { scheme: 'sign-in-with-x', domain: 'test.com' };
      const response = new Response(
        JSON.stringify({ error: { siwx: ext } }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const result = await parseSIWxExtension(response);
      expect(result).toEqual(ext);
    });

    it('should parse SIWX extension from response body extensions.siwx', async () => {
      const ext = { scheme: 'sign-in-with-x', domain: 'test.com' };
      const response = new Response(
        JSON.stringify({ extensions: { siwx: ext } }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const result = await parseSIWxExtension(response);
      expect(result).toEqual(ext);
    });

    it('should return undefined when no SIWX extension present', async () => {
      const response = new Response(
        JSON.stringify({ error: 'payment_required' }),
        { status: 402 }
      );
      const result = await parseSIWxExtension(response);
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-JSON body without header', async () => {
      const response = new Response('not json', { status: 402 });
      const result = await parseSIWxExtension(response);
      expect(result).toBeUndefined();
    });
  });

  describe('buildSIWxHeaderValue', () => {
    it('should encode payload as base64 JSON', () => {
      const payload = { domain: 'test.com', nonce: 'abc' };
      const header = buildSIWxHeaderValue(payload);
      const decoded = JSON.parse(
        Buffer.from(header, 'base64').toString('utf-8')
      );
      expect(decoded).toEqual(payload);
    });
  });

  describe('wrapFetchWithSIWx', () => {
    const mockSigner: SIWxSigner = {
      signMessage: async () => '0xsignature',
      getAddress: async () =>
        '0x1234567890abcdef1234567890abcdef12345678',
      getChainId: async () => 'eip155:84532',
    };

    it('should pass through non-402 responses unchanged', async () => {
      const baseFetch = async () => new Response('ok', { status: 200 });
      const wrappedFetch = wrapFetchWithSIWx(baseFetch, mockSigner);
      const response = await wrappedFetch('http://test.com/api');
      expect(response.status).toBe(200);
    });

    it('should pass through 402 without SIWX extension', async () => {
      const baseFetch = async () =>
        new Response(JSON.stringify({ error: 'payment_required' }), {
          status: 402,
        });
      const wrappedFetch = wrapFetchWithSIWx(baseFetch, mockSigner);
      const response = await wrappedFetch('http://test.com/api');
      expect(response.status).toBe(402);
    });

    it('should retry with SIWX header when 402 has SIWX extension', async () => {
      let callCount = 0;
      const ext = {
        scheme: 'sign-in-with-x',
        domain: 'test.com',
        uri: 'http://test.com/api',
        nonce: 'abc123',
      };

      const baseFetch = async (
        _input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { siwx: ext } }), {
            status: 402,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Second call should have SIWX header
        const headers = new Headers(init?.headers);
        expect(headers.get('SIGN-IN-WITH-X')).toBeDefined();
        return new Response('ok', { status: 200 });
      };

      const wrappedFetch = wrapFetchWithSIWx(baseFetch, mockSigner);
      const response = await wrappedFetch('http://test.com/api');
      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
    });

    it('should include signature in SIWX payload', async () => {
      let capturedHeaders: Headers | undefined;
      const ext = {
        scheme: 'sign-in-with-x',
        domain: 'test.com',
        uri: 'http://test.com/api',
        nonce: 'nonce1',
      };

      const baseFetch = async (
        _input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        if (!capturedHeaders) {
          return new Response(JSON.stringify({ error: { siwx: ext } }), {
            status: 402,
          });
        }
        return new Response('ok', { status: 200 });
      };

      // Capture headers on retry
      let callCount = 0;
      const capturingFetch = async (
        input: RequestInfo | URL,
        init?: RequestInit
      ) => {
        callCount++;
        if (callCount === 2) {
          capturedHeaders = new Headers(init?.headers);
        }
        return baseFetch(input, init);
      };

      const wrappedFetch = wrapFetchWithSIWx(capturingFetch, mockSigner);
      await wrappedFetch('http://test.com/api');

      expect(capturedHeaders).toBeDefined();
      const headerValue = capturedHeaders!.get('SIGN-IN-WITH-X')!;
      const decoded = JSON.parse(
        Buffer.from(headerValue, 'base64').toString('utf-8')
      );
      expect(decoded.signature).toBe('0xsignature');
      expect(decoded.address).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(decoded.chainId).toBe('eip155:84532');
    });

    it('should compose with payment fetch (payment + SIWX)', async () => {
      const ext = {
        scheme: 'sign-in-with-x',
        domain: 'test.com',
        uri: 'http://test.com/api',
        nonce: 'nonce1',
      };
      let callCount = 0;

      const baseFetch = async (
        _input: RequestInfo | URL,
        _init?: RequestInit
      ) => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: { siwx: ext } }), {
            status: 402,
          });
        }
        return new Response('access granted', { status: 200 });
      };

      const siwxFetch = wrapFetchWithSIWx(baseFetch, mockSigner);
      const response = await siwxFetch('http://test.com/api');
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('access granted');
    });
  });
});
