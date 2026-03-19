import type { SIWxStorage } from './siwx-storage';

export type SIWxPayload = {
  domain: string;
  address: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  statement?: string;
  resources?: string[];
};

export type SIWxVerifyResult = {
  success: boolean;
  address?: string;
  chainId?: string;
  grantedBy?: 'entitlement' | 'auth-only';
  payload?: SIWxPayload;
  error?: string;
};

export type SIWxVerifyOptions = {
  storage: SIWxStorage;
  resourceUri: string;
  domain: string;
  requireEntitlement?: boolean; // true for paid-route reuse, false for auth-only
};

/**
 * Parse a SIWX header value into a structured payload.
 * The header is expected to be a base64-encoded JSON string.
 */
export function parseSIWxHeader(
  headerValue: string | null | undefined
): SIWxPayload | undefined {
  if (!headerValue) return undefined;
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    return JSON.parse(decoded) as SIWxPayload;
  } catch {
    return undefined;
  }
}

/**
 * Verify a SIWX payload against storage and constraints.
 * Does NOT verify the cryptographic signature (that requires chain-specific logic).
 * This handles: payload shape, domain/URI matching, timing, nonce replay, entitlement check.
 */
export async function verifySIWxPayload(
  payload: SIWxPayload,
  options: SIWxVerifyOptions
): Promise<SIWxVerifyResult> {
  // Validate required fields
  if (
    !payload.address ||
    !payload.chainId ||
    !payload.nonce ||
    !payload.uri ||
    !payload.domain
  ) {
    return { success: false, error: 'missing_required_fields' };
  }

  // Validate domain matches
  if (payload.domain !== options.domain) {
    return { success: false, error: 'domain_mismatch' };
  }

  // Validate resource URI matches
  if (payload.uri !== options.resourceUri) {
    return { success: false, error: 'resource_uri_mismatch' };
  }

  // Validate timing
  const now = Date.now();

  if (payload.issuedAt) {
    const issuedAt = new Date(payload.issuedAt).getTime();
    if (isNaN(issuedAt)) {
      return { success: false, error: 'invalid_issued_at' };
    }
  }

  if (payload.expirationTime) {
    const expiration = new Date(payload.expirationTime).getTime();
    if (isNaN(expiration) || expiration < now) {
      return { success: false, error: 'expired' };
    }
  }

  if (payload.notBefore) {
    const notBefore = new Date(payload.notBefore).getTime();
    if (isNaN(notBefore) || notBefore > now) {
      return { success: false, error: 'not_yet_valid' };
    }
  }

  // Check nonce replay
  const nonceUsed = await options.storage.hasUsedNonce(payload.nonce);
  if (nonceUsed) {
    return { success: false, error: 'nonce_replayed' };
  }

  // Record nonce
  await options.storage.recordNonce(payload.nonce, {
    resource: options.resourceUri,
    address: payload.address,
    expiresAt: payload.expirationTime
      ? new Date(payload.expirationTime).getTime()
      : undefined,
  });

  const normalizedAddress = payload.address.toLowerCase();

  // For paid-route reuse, check entitlement
  if (options.requireEntitlement !== false) {
    const hasPaid = await options.storage.hasPaid(
      options.resourceUri,
      normalizedAddress
    );
    if (!hasPaid) {
      return { success: false, error: 'no_entitlement' };
    }
    return {
      success: true,
      address: normalizedAddress,
      chainId: payload.chainId,
      grantedBy: 'entitlement',
      payload,
    };
  }

  // Auth-only mode - just verify the signature is valid (no entitlement needed)
  return {
    success: true,
    address: normalizedAddress,
    chainId: payload.chainId,
    grantedBy: 'auth-only',
    payload,
  };
}

/**
 * Build a SIWX extension declaration for a 402 response.
 */
export function buildSIWxExtensionDeclaration(options: {
  resourceUri: string;
  domain: string;
  statement?: string;
  chainId?: string;
  expirationSeconds?: number;
}): Record<string, unknown> {
  const nonce = generateNonce();
  const now = new Date();

  return {
    scheme: 'sign-in-with-x',
    domain: options.domain,
    uri: options.resourceUri,
    version: '1',
    chainId: options.chainId,
    nonce,
    issuedAt: now.toISOString(),
    ...(options.expirationSeconds
      ? {
          expirationTime: new Date(
            now.getTime() + options.expirationSeconds * 1000
          ).toISOString(),
        }
      : {}),
    ...(options.statement ? { statement: options.statement } : {}),
  };
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
