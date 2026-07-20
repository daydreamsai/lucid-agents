import { buildSIWxMessage, type SIWxPayload } from './siwx-verify';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';

export type SIWxSigner = {
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string>;
  getChainId: () => Promise<string>;
};

export type SIWxClientConfig = {
  signer?: SIWxSigner;
};

/**
 * Check if an authorization or payment response includes a SIWX declaration.
 * Checks both the X-SIWX-EXTENSION header and the response body.
 * Note: this clones the response to read the body, so the original remains consumable.
 */
export async function hasSIWxExtension(response: Response): Promise<boolean> {
  const siwxHeader = response.headers.get('X-SIWX-EXTENSION');
  if (siwxHeader) return true;

  try {
    const body = await response.clone().json();
    if (body?.error?.siwx) return true;
    if (body?.extensions?.siwx) return true;
  } catch {
    // not JSON
  }

  return false;
}

/**
 * Parse a SIWX extension from an authorization or payment response.
 * Checks the X-SIWX-EXTENSION header first, then falls back to the response body.
 */
export async function parseSIWxExtension(
  response: Response
): Promise<Record<string, unknown> | undefined> {
  // Check header first
  const siwxHeader = response.headers.get('X-SIWX-EXTENSION');
  if (siwxHeader) {
    try {
      return JSON.parse(decodeBase64Utf8(siwxHeader)) as Record<
        string,
        unknown
      >;
    } catch {
      // fall through
    }
  }

  // Check body
  try {
    const body = await response.clone().json();
    if (body?.error?.siwx) return body.error.siwx as Record<string, unknown>;
    if (body?.extensions?.siwx)
      return body.extensions.siwx as Record<string, unknown>;
  } catch {
    // not JSON
  }

  return undefined;
}

/**
 * Build a SIWX header value from a signed payload.
 */
export function buildSIWxHeaderValue(payload: Record<string, unknown>): string {
  return encodeBase64Utf8(JSON.stringify(payload));
}

/**
 * Create a SIWX-aware fetch wrapper.
 * When a 401 or 402 response includes a SIWX extension, the wrapper attempts
 * to sign and retry. A 402 without SIWX continues to the payment wrapper.
 */
type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export function wrapFetchWithSIWx(
  baseFetch: FetchFn,
  signer: SIWxSigner
): FetchFn {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const response = await baseFetch(input, init);

    // Auth-only SIWX uses 401; combined SIWX and payment uses 402.
    if (response.status !== 401 && response.status !== 402) return response;

    // Check for SIWX extension
    const siwxExt = await parseSIWxExtension(response);
    if (!siwxExt) return response; // No SIWX, let payment flow handle it

    // Build SIWX payload
    const address = await signer.getAddress();
    const chainId = await signer.getChainId();

    const payload: Record<string, unknown> = {
      domain: siwxExt.domain,
      address,
      uri: siwxExt.uri,
      version: (siwxExt.version as string) ?? '1',
      chainId,
      nonce: siwxExt.nonce,
      issuedAt: (siwxExt.issuedAt as string) ?? new Date().toISOString(),
      ...(siwxExt.expirationTime
        ? { expirationTime: siwxExt.expirationTime }
        : {}),
      ...(siwxExt.statement ? { statement: siwxExt.statement } : {}),
    };

    // Sign the payload
    const signature = await signer.signMessage(
      buildSIWxMessage(payload as unknown as SIWxPayload)
    );
    payload.signature = signature;

    // Retry with SIWX header
    const headers = new Headers(init?.headers);
    headers.set('SIGN-IN-WITH-X', buildSIWxHeaderValue(payload));

    return baseFetch(input, { ...init, headers });
  };
}
