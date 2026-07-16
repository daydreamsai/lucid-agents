import { Credential, Receipt } from 'mppx';

/**
 * Decode a standard `Authorization: Payment …` credential.
 *
 * **WARNING**: This is a **decode-only** helper. It performs NO cryptographic
 * verification, signature checking, or payment confirmation. Do NOT use this
 * as the sole payment gate. In production, credential validation MUST be
 * handled by the mppx server SDK or an equivalent verification layer.
 *
 * @returns The decoded challenge ID and payload, or `null` if the header is
 *          missing or malformed.
 */
export function decodeMppCredential(request: Request): {
  challengeId: string;
  challenge: {
    id: string;
    realm: string;
    method: string;
    intent: string;
    request: Record<string, unknown>;
    description?: string;
    digest?: string;
    expires?: string;
  };
  payload: Record<string, unknown>;
  source?: string;
} | null {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  try {
    const payment = Credential.extractPaymentScheme(authorization);
    if (!payment) return null;
    const credential = Credential.deserialize(payment);
    if (
      !credential.payload ||
      typeof credential.payload !== 'object' ||
      Array.isArray(credential.payload)
    ) {
      return null;
    }
    return {
      challengeId: credential.challenge.id,
      challenge: credential.challenge,
      payload: credential.payload as Record<string, unknown>,
      ...(credential.source ? { source: credential.source } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated Renamed to {@link decodeMppCredential}. This alias will be
 * removed in a future major version.
 */
export const decodePaymentHeader = decodeMppCredential;

/** @deprecated Use {@link decodeMppCredential}. */
export const extractMppCredential = decodeMppCredential;

/**
 * Create a Payment-Receipt header value.
 */
export function createReceiptHeader(receipt: {
  method: string;
  reference: string;
  status: 'success';
  timestamp: string;
  externalId?: string;
}): string {
  return Receipt.serialize(receipt);
}
