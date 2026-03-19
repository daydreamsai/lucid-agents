export type SIWxSigner = {
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string>;
  getChainId: () => Promise<string>;
};

export type SIWxClientConfig = {
  signer?: SIWxSigner;
};

/**
 * Check if a 402 response includes a SIWX extension declaration.
 */
export function hasSIWxExtension(response: Response): boolean {
  const siwxHeader = response.headers.get('X-SIWX-EXTENSION');
  if (siwxHeader) return true;

  // Header-only check; body must be checked via parseSIWxExtension
  return false;
}

/**
 * Parse SIWX extension from a 402 response.
 * Checks the X-SIWX-EXTENSION header first, then falls back to the response body.
 */
export async function parseSIWxExtension(
  response: Response
): Promise<Record<string, unknown> | undefined> {
  // Check header first
  const siwxHeader = response.headers.get('X-SIWX-EXTENSION');
  if (siwxHeader) {
    try {
      return JSON.parse(
        Buffer.from(siwxHeader, 'base64').toString('utf-8')
      ) as Record<string, unknown>;
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
export function buildSIWxHeaderValue(
  payload: Record<string, unknown>
): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Create a SIWX-aware fetch wrapper.
 * When a 402 response includes a SIWX extension, the wrapper will attempt
 * to sign and retry before falling through to payment.
 */
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function wrapFetchWithSIWx(
  baseFetch: FetchFn,
  signer: SIWxSigner
): FetchFn {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const response = await baseFetch(input, init);

    // Only intercept 402 responses
    if (response.status !== 402) return response;

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
    const signature = await signer.signMessage(JSON.stringify(payload));
    payload.signature = signature;

    // Retry with SIWX header
    const headers = new Headers(init?.headers);
    headers.set('SIGN-IN-WITH-X', buildSIWxHeaderValue(payload));

    return baseFetch(input, { ...init, headers });
  };
}
