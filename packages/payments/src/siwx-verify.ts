import {
  SIGN_IN_WITH_X,
  SIWxPayloadSchema,
  createSIWxMessage,
  declareSIWxExtension,
  parseSIWxHeader as parseOfficialSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
  type CompleteSIWxInfo,
  type EVMMessageVerifier,
  type SIWxExtension,
  type SIWxPayload as OfficialSIWxPayload,
} from '@x402/extensions/sign-in-with-x';
import {
  decodePaymentRequiredHeader,
  encodePaymentRequiredHeader,
} from '@x402/core/http';
import type { PaymentRequired, PaymentRequirements } from '@x402/core/types';
import type { SIWxStorage } from './siwx-storage';

export type SIWxPayload = OfficialSIWxPayload;

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
  /** Internal storage scope for an entitlement when it differs from the signed URI. */
  entitlementResource?: string;
  /** Configured public origin. Request host headers are never used. */
  origin?: string;
  /** @deprecated Use `origin`. Retained for source compatibility. */
  domain?: string;
  requireEntitlement?: boolean;
  supportedChainIds?: readonly string[];
  evmVerifier?: EVMMessageVerifier;
  /** Skip cryptographic signature verification (for testing only). */
  skipSignatureVerification?: boolean;
};

/**
 * Parse and validate the official `SIGN-IN-WITH-X` header payload.
 */
export function parseSIWxHeader(
  headerValue: string | null | undefined
): SIWxPayload | undefined {
  if (!headerValue) return undefined;
  try {
    return parseOfficialSIWxHeader(headerValue);
  } catch {
    return undefined;
  }
}

/**
 * Build the official SIWE/SIWS message for a SIWX payload.
 */
export function buildSIWxMessage(payload: SIWxPayload): string {
  return createSIWxMessage(payload as CompleteSIWxInfo, payload.address);
}

/**
 * Validate an official SIWX proof while preserving Lucid's atomic nonce and
 * entitlement semantics.
 */
export async function verifySIWxPayload(
  untrustedPayload: SIWxPayload,
  options: SIWxVerifyOptions
): Promise<SIWxVerifyResult> {
  const parsed = SIWxPayloadSchema.safeParse(untrustedPayload);
  if (!parsed.success) {
    return { success: false, error: 'invalid_siwx_payload' };
  }
  const payload = parsed.data;

  const expectedOrigin = resolveExpectedOrigin(options);
  const validation = await validateSIWxMessage(payload, expectedOrigin);
  if (!validation.isValid) {
    return { success: false, error: validation.invalidReason };
  }
  if (payload.uri !== options.resourceUri) {
    return { success: false, error: 'invalid_siwx_uri_mismatch' };
  }
  if (
    options.supportedChainIds &&
    !options.supportedChainIds.includes(payload.chainId)
  ) {
    return { success: false, error: 'invalid_siwx_chain_id' };
  }

  if (!options.skipSignatureVerification) {
    const verification = await verifySIWxSignature(payload, {
      evmVerifier: options.evmVerifier,
    }).catch(() => ({
      isValid: false as const,
      invalidReason: 'invalid_siwx_verifier_error' as const,
      invalidMessage: 'SIWX signature verification failed.',
    }));
    if (!verification.isValid) {
      return { success: false, error: verification.invalidReason };
    }
  }

  const normalizedAddress = payload.chainId.startsWith('eip155:')
    ? payload.address.toLowerCase()
    : payload.address;

  // Entitlement is checked before nonce consumption so an unpaid proof can be
  // retried after settlement without burning its challenge.
  if (options.requireEntitlement !== false) {
    const hasPaid = await options.storage.hasPaid(
      options.entitlementResource ?? options.resourceUri,
      normalizedAddress
    );
    if (!hasPaid) {
      return { success: false, error: 'no_entitlement' };
    }
  }

  const nonceResult = await options.storage.consumeNonce(payload.nonce, {
    resource: options.resourceUri,
    address: payload.address,
    expiresAt: payload.expirationTime
      ? new Date(payload.expirationTime).getTime()
      : undefined,
  });
  if (nonceResult === 'already_used') {
    return { success: false, error: 'nonce_replayed' };
  }

  return {
    success: true,
    address: normalizedAddress,
    chainId: payload.chainId,
    grantedBy:
      options.requireEntitlement === false ? 'auth-only' : 'entitlement',
    payload,
  };
}

function resolveExpectedOrigin(options: SIWxVerifyOptions): URL {
  if (options.origin) return new URL(options.origin);
  if (options.domain) return new URL(`https://${options.domain}`);
  throw new Error('SIWX verification requires a configured public origin.');
}

/**
 * Build the official SIWX extension value placed at
 * `PaymentRequired.extensions["sign-in-with-x"]`.
 */
export function buildSIWxExtensionDeclaration(options: {
  resourceUri: string;
  /** @deprecated Derived from `resourceUri`; retained for source compatibility. */
  domain?: string;
  statement?: string;
  chainId?: string | readonly string[];
  expirationSeconds?: number;
}): SIWxExtension {
  const resource = new URL(options.resourceUri);
  if (options.domain && options.domain !== resource.host) {
    throw new Error(
      `SIWX declaration domain "${options.domain}" does not match resource origin "${resource.host}".`
    );
  }
  const now = new Date();
  const networks = options.chainId
    ? Array.isArray(options.chainId)
      ? [...options.chainId]
      : [options.chainId]
    : [];
  const declared = declareSIWxExtension({
    ...(options.statement ? { statement: options.statement } : {}),
    network: networks,
    expirationSeconds: options.expirationSeconds,
  })[SIGN_IN_WITH_X];

  return {
    info: {
      domain: resource.host,
      uri: resource.toString(),
      version: '1',
      nonce: generateNonce(),
      issuedAt: now.toISOString(),
      resources: [resource.toString()],
      ...(options.expirationSeconds !== undefined
        ? {
            expirationTime: new Date(
              now.getTime() + options.expirationSeconds * 1000
            ).toISOString(),
          }
        : {}),
      ...(options.statement ? { statement: options.statement } : {}),
    },
    supportedChains: declared.supportedChains,
    schema: declared.schema,
  };
}

/**
 * Add an official SIWX extension to an x402 response and emit only the
 * standard `PAYMENT-REQUIRED` transport header.
 */
export function enrichResponseWithSIWxChallenge(
  body: Record<string, unknown>,
  declaration: SIWxExtension,
  _statusCode: 401 | 402,
  paymentRequiredHeader?: string | null
): { body: Record<string, unknown>; headers: Record<string, string> } {
  const existing = decodeExistingPaymentRequired(paymentRequiredHeader);
  const extensions = {
    ...(isRecord(existing?.extensions) ? existing.extensions : {}),
    ...(isRecord(body.extensions) ? body.extensions : {}),
    [SIGN_IN_WITH_X]: declaration,
  };
  const enrichedBody = {
    ...body,
    extensions,
  };
  const paymentRequired: PaymentRequired = {
    x402Version:
      typeof body.x402Version === 'number'
        ? body.x402Version
        : (existing?.x402Version ?? 2),
    resource: isResourceInfo(body.resource)
      ? body.resource
      : (existing?.resource ?? { url: declaration.info.uri }),
    accepts: Array.isArray(body.accepts)
      ? (body.accepts as PaymentRequirements[])
      : Array.isArray(existing?.accepts)
        ? existing.accepts
        : [],
    ...(typeof body.error === 'string'
      ? { error: body.error }
      : typeof existing?.error === 'string'
        ? { error: existing.error }
        : {}),
    extensions,
  };

  return {
    body: enrichedBody,
    headers: {
      'PAYMENT-REQUIRED': encodePaymentRequiredHeader(paymentRequired),
    },
  };
}

function decodeExistingPaymentRequired(
  header: string | null | undefined
): PaymentRequired | undefined {
  if (!header) return undefined;
  try {
    return decodePaymentRequiredHeader(header);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResourceInfo(value: unknown): value is PaymentRequired['resource'] {
  return isRecord(value) && typeof value.url === 'string';
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
