import { decodePaymentRequiredHeader } from '@x402/core/http';
import {
  SIGN_IN_WITH_X,
  createSIWxMessage,
  encodeSIWxHeader,
  type CompleteSIWxInfo,
  type SIWxExtension,
  type SIWxPayload,
} from '@x402/extensions/sign-in-with-x';

/**
 * Legacy Lucid signer interface retained for source compatibility.
 *
 * New integrations may also use the official x402 SIWX signer helpers
 * directly; this adapter keeps existing Lucid wallet integrations working.
 */
export type SIWxSigner = {
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string>;
  getChainId: () => Promise<string>;
};

export type SIWxClientConfig = {
  signer?: SIWxSigner;
};

type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Check for an official SIWX extension declaration. */
export async function hasSIWxExtension(response: Response): Promise<boolean> {
  return (await parseSIWxExtension(response)) !== undefined;
}

/**
 * Parse the official SIWX declaration from the standard x402
 * `PAYMENT-REQUIRED` header, with the equivalent body field as a fallback.
 */
export async function parseSIWxExtension(
  response: Response
): Promise<SIWxExtension | undefined> {
  const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
  if (paymentRequired) {
    try {
      const decoded = decodePaymentRequiredHeader(paymentRequired);
      const extension = decoded.extensions?.[SIGN_IN_WITH_X];
      if (isSIWxExtension(extension)) return extension;
    } catch {
      // Fall through to a JSON body for auth-only and non-x402 transports.
    }
  }

  try {
    const body = (await response.clone().json()) as unknown;
    if (!isRecord(body) || !isRecord(body.extensions)) return undefined;
    const extension = body.extensions[SIGN_IN_WITH_X];
    return isSIWxExtension(extension) ? extension : undefined;
  } catch {
    return undefined;
  }
}

/** @deprecated Prefer `encodeSIWxHeader` from the official x402 extension. */
export function buildSIWxHeaderValue(payload: Record<string, unknown>): string {
  return encodeSIWxHeader(payload as SIWxPayload);
}

/**
 * Add SIWX authentication to one 401 or 402 challenge/retry cycle.
 *
 * The declaration and payload use the official x402 SIWX format. Auth-only
 * routes retain Lucid's 401 behavior; paid routes use the standard 402 flow.
 */
export function wrapFetchWithSIWx(
  baseFetch: FetchFn,
  signer: SIWxSigner
): FetchFn {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    const retryRequest = request.clone();
    const response = await baseFetch(request);

    if (response.status !== 401 && response.status !== 402) return response;

    const extension = await parseSIWxExtension(response);
    if (!extension) return response;
    if (retryRequest.headers.has('SIGN-IN-WITH-X')) {
      throw new Error('SIWX authentication already attempted');
    }

    const [address, chainId] = await Promise.all([
      signer.getAddress(),
      signer.getChainId(),
    ]);
    const supportedChain = extension.supportedChains.find(
      chain => chain.chainId === chainId
    );
    if (!supportedChain) return response;

    const completeInfo: CompleteSIWxInfo = {
      ...extension.info,
      chainId: supportedChain.chainId,
      type: supportedChain.type,
      signatureScheme: supportedChain.signatureScheme,
    };
    const signature = await signer.signMessage(
      createSIWxMessage(completeInfo, address)
    );
    const payload: SIWxPayload = {
      ...completeInfo,
      address,
      signature,
    };
    retryRequest.headers.set('SIGN-IN-WITH-X', encodeSIWxHeader(payload));
    return baseFetch(retryRequest);
  };
}

function isSIWxExtension(value: unknown): value is SIWxExtension {
  return (
    isRecord(value) &&
    isRecord(value.info) &&
    Array.isArray(value.supportedChains) &&
    isRecord(value.schema)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
