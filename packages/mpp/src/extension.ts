import type {
  AgentManifest,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type { FetchFunction } from '@lucid-agents/types/http';
import type {
  MppChallengeBinding,
  MppChallengeStore,
  MppAccountingDisposition,
  MppAuthorizationOptions,
  MppAuthorizationResult,
  MppClientConfig,
  MppConfig,
  EvmServerConfig,
  MppPaymentSelection,
  MppPaymentOperation,
  MppPaymentRequirement,
  MppRuntime,
  MppSessionReceiptData,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
  TempoSessionServerConfig,
  TempoSessionStore,
} from '@lucid-agents/types/mpp';
import { Challenge, Receipt, type Method } from 'mppx';
import { Header as X402Header } from 'mppx/x402';

import {
  buildChallengeSet,
  mppBaseUnits,
  resolveEntrypointMppConfig,
  resolveEntrypointPrice,
  type MppWireChallenge,
} from './challenge';
import { buildManifestWithMpp } from './manifest';
import { createInMemoryMppChallengeStore } from './in-memory-challenge-store';
import { createTempoSessionMeter } from './tempo-session-meter';
import { createInMemoryTempoSessionStore } from './tempo-session-store';
import { decodeMppCredential } from './middleware';
import { resolveMppMethodImplementation } from './method-implementation';
import { negotiateMppOffers } from './negotiation';
import {
  getMppOpenApiComponents,
  projectMppOpenApi,
  projectMppPayment,
  resolveMppOffers,
} from './openapi';

const CONTENT_RESPONSE_MARKER = 'x-lucid-mpp-content-response';
const MAX_RECEIPT_HEADER_BYTES = 8 * 1024;
const MIN_SECRET_KEY_BYTES = 32;

type NativeServerIntent = Method.AnyServer;
type RuntimeRail = {
  descriptor: MppServerMethod;
  native?: NativeServerIntent;
  streamNative?: NativeServerIntent;
  session?: {
    config: TempoSessionServerConfig;
    store: TempoSessionStore;
    tickCost: bigint;
  };
};
type VerifiedMppAuthorization = Extract<
  MppAuthorizationResult,
  { authorized: true }
>;
type ChallengeClaim =
  | {
      state: 'claimed';
      leaseId: string;
      leaseExpiresAt: number;
      renewAfterMs: number;
    }
  | { state: 'cached'; authorization: VerifiedMppAuthorization }
  | { state: 'in_progress' }
  | {
      state: 'invalid';
      reason: 'missing' | 'expired' | 'binding_mismatch' | 'consumed';
    };
type NativePaymentResult =
  | { status: 402; challenge: Response }
  | {
      status: 200;
      withReceipt: (response?: Response) => Response;
    };
type NativeHandlerFactory = (
  options: Record<string, unknown>
) => (request: Request) => Promise<NativePaymentResult>;
type RequestBinding = {
  method: string;
  target: string;
  bodyDigest?: string;
};

class MppChallengeLeaseLostError extends Error {
  constructor() {
    super('MPP challenge verification lease was lost');
    this.name = 'MppChallengeLeaseLostError';
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function requestBodyDigest(
  request: Request
): Promise<string | undefined> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) {
    return undefined;
  }
  const body = await request.clone().arrayBuffer();
  return sha256Digest(body);
}

async function sha256Digest(value: ArrayBuffer | string): Promise<string> {
  const bytes =
    typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha-256=:${encodeBase64(new Uint8Array(hash))}:`;
}

async function requestBinding(request: Request): Promise<RequestBinding> {
  const url = new URL(request.url);
  const bodyDigest = await requestBodyDigest(request);
  return {
    method: request.method.toUpperCase(),
    target: `${url.pathname}${url.search}`,
    ...(bodyDigest ? { bodyDigest } : {}),
  };
}

function bindingScope(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream',
  binding: RequestBinding
): string {
  return JSON.stringify([
    entrypoint.key,
    kind,
    binding.method,
    binding.target,
    ...(binding.bodyDigest ? [binding.bodyDigest] : []),
  ]);
}

function normalizeReceiptHeader(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error('MPP verifier omitted its receipt');
  }
  const receipt = value;
  if (
    receipt !== receipt.trim() ||
    new TextEncoder().encode(receipt).byteLength > MAX_RECEIPT_HEADER_BYTES ||
    /[\u0000-\u001f\u007f]/u.test(receipt)
  ) {
    throw new Error('MPP verifier returned an invalid receipt header');
  }
  const headers = new Headers();
  try {
    headers.set('Payment-Receipt', receipt);
  } catch {
    throw new Error('MPP verifier returned an invalid receipt header');
  }
  if (headers.get('Payment-Receipt') !== receipt) {
    throw new Error('MPP verifier returned an invalid receipt header');
  }
  return receipt;
}

function entrypointRequiresPayment(entrypoint: EntrypointDef): boolean {
  if (entrypoint.paymentProtocol === 'x402') return false;
  const { price } = entrypoint;
  if (!price) return false;
  if (typeof price === 'string') return price.trim().length > 0;
  const hasInvoke =
    typeof price.invoke === 'string' && price.invoke.trim().length > 0;
  const hasStream =
    typeof price.stream === 'string' && price.stream.trim().length > 0;
  return hasInvoke || hasStream;
}

function nativeForRail(
  rail: RuntimeRail,
  kind: 'invoke' | 'stream'
): NativeServerIntent | undefined {
  return kind === 'stream' ? (rail.streamNative ?? rail.native) : rail.native;
}

function boundedTempoSessionStore(
  store: TempoSessionStore,
  minimum: bigint,
  maximum: bigint
): TempoSessionStore {
  const validate = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const deposit = (value as { deposit?: unknown }).deposit;
    if (typeof deposit !== 'bigint') return;
    if ((value as { finalized?: unknown }).finalized === true) {
      if (deposit !== 0n) {
        throw new Error('Finalized Tempo session deposit must be zero');
      }
      return;
    }
    if (deposit < minimum || deposit > maximum) {
      throw new Error(
        `Tempo session deposit must be between ${minimum} and ${maximum} base units`
      );
    }
  };
  return {
    durability: store.durability,
    get: key => store.get(key),
    async put(key, value) {
      validate(value);
      await store.put(key, value);
    },
    delete: key => store.delete(key),
    update: (key, fn) =>
      store.update(key, current => {
        const change = fn(current);
        if (change.op === 'set') validate(change.value);
        return change;
      }),
    ...(store.close ? { close: () => store.close!() } : {}),
  };
}

function sessionReceipt(value: string): MppSessionReceiptData | undefined {
  const decoded = Receipt.deserialize(value) as Record<string, unknown>;
  if (
    decoded.method !== 'tempo' ||
    decoded.intent !== 'session' ||
    decoded.status !== 'success' ||
    typeof decoded.timestamp !== 'string' ||
    typeof decoded.reference !== 'string' ||
    typeof decoded.challengeId !== 'string' ||
    typeof decoded.channelId !== 'string' ||
    !decoded.channelId.startsWith('0x') ||
    typeof decoded.acceptedCumulative !== 'string' ||
    typeof decoded.spent !== 'string'
  ) {
    return undefined;
  }
  return decoded as MppSessionReceiptData;
}

async function materializeRails(config: MppConfig): Promise<{
  rails: RuntimeRail[];
  server?: typeof import('mppx/server');
}> {
  const needsNative = config.methods.some(
    method => resolveMppMethodImplementation(method) !== 'custom'
  );
  const server = needsNative ? await import('mppx/server') : undefined;
  const rails: RuntimeRail[] = [];

  for (const descriptor of config.methods) {
    const implementation = resolveMppMethodImplementation(descriptor);
    if (implementation === 'custom') {
      rails.push({ descriptor });
      continue;
    }
    if (!server) throw new Error('mppx server runtime was not loaded');

    if (implementation === 'tempo') {
      const value = descriptor.config as TempoServerConfig;
      const parameters: Record<string, unknown> = {
        currency: value.currency,
        recipient: value.recipient,
        decimals: value.decimals ?? 6,
        ...(value.chainId !== undefined ? { chainId: value.chainId } : {}),
        ...(value.testnet !== undefined ? { testnet: value.testnet } : {}),
        ...(value.getClient ? { getClient: value.getClient } : {}),
      };
      // Materialize charge explicitly. Session configuration has a separate
      // lifecycle and must not make a charge-only merchant initialize it.
      const native = server.tempo.charge(
        parameters as Parameters<typeof server.tempo.charge>[0]
      );
      rails.push({ descriptor, native });
      continue;
    }

    if (implementation === 'tempo-session') {
      const value = descriptor.config as TempoSessionServerConfig;
      const rawStore = value.store ?? createInMemoryTempoSessionStore();
      if (value.mode === 'production' && rawStore.durability !== 'durable') {
        throw new Error(
          'Tempo session production mode requires durable channel storage'
        );
      }
      const minimum = BigInt(
        mppBaseUnits(value.deposit.minimum, value.decimals)
      );
      const maximum = BigInt(
        mppBaseUnits(value.deposit.maximum, value.decimals)
      );
      const store = boundedTempoSessionStore(rawStore, minimum, maximum);
      const parameters: Record<string, unknown> = {
        account: value.account,
        chainId: value.chainId,
        currency: value.currency,
        recipient: value.recipient,
        decimals: value.decimals,
        amount: value.amount,
        unitType: value.unitType,
        suggestedDeposit: value.deposit.suggested,
        store,
        getClient: value.getClient,
        ...(value.bootstrap !== undefined
          ? { bootstrap: value.bootstrap }
          : {}),
        ...(value.resolveChannelId
          ? { resolveChannelId: value.resolveChannelId }
          : {}),
        ...(value.settlementSchedule
          ? { settlementSchedule: value.settlementSchedule }
          : {}),
        ...(value.onSettlement
          ? { onSessionSettlement: value.onSettlement }
          : {}),
        ...(value.channelStateTtlMs !== undefined
          ? { channelStateTtl: value.channelStateTtlMs }
          : {}),
        ...(value.minVoucherDelta !== undefined
          ? { minVoucherDelta: value.minVoucherDelta }
          : {}),
        ...(value.escrowContract
          ? { escrowContract: value.escrowContract }
          : {}),
        ...(value.operator ? { operator: value.operator } : {}),
        ...(value.feePayer !== undefined ? { feePayer: value.feePayer } : {}),
        ...(value.feeToken ? { feeToken: value.feeToken } : {}),
      };
      const native = server.tempo.session({
        ...(parameters as Parameters<typeof server.tempo.session>[0]),
        sse: false,
      });
      const streamNative = server.tempo.session({
        ...(parameters as Parameters<typeof server.tempo.session>[0]),
        sse: true,
      });
      rails.push({
        descriptor,
        native,
        streamNative,
        session: {
          config: value,
          store,
          tickCost: BigInt(mppBaseUnits(value.amount, value.decimals)),
        },
      });
      continue;
    }

    if (implementation === 'evm') {
      const value = descriptor.config as EvmServerConfig;
      const parameters: Record<string, unknown> = {
        chainId: value.chainId,
        currency: value.currency,
        recipient: value.recipient,
        decimals: value.decimals,
        authorization: value.authorization,
        ...(value.settlement.type === 'custom'
          ? {
              settle: value.settlement.settle,
              ...(value.settlement.maxTimeoutSeconds !== undefined
                ? {
                    x402: {
                      maxTimeoutSeconds: value.settlement.maxTimeoutSeconds,
                    },
                  }
                : {}),
            }
          : {
              x402: {
                facilitator: value.settlement.facilitator,
                ...(value.settlement.fetch
                  ? { fetch: value.settlement.fetch }
                  : {}),
                ...(value.settlement.maxTimeoutSeconds !== undefined
                  ? {
                      maxTimeoutSeconds: value.settlement.maxTimeoutSeconds,
                    }
                  : {}),
              },
            }),
      };
      const native = server.evm.charge(
        parameters as Parameters<typeof server.evm.charge>[0]
      );
      rails.push({ descriptor, native });
      continue;
    }

    const value = descriptor.config as StripeServerConfig;
    const parameters: Record<string, unknown> = {
      secretKey: value.secretKey,
      networkId: value.networkId,
      currency: value.currency ?? config.currency ?? 'usd',
      decimals: value.decimals ?? 2,
      paymentMethodTypes: value.paymentMethodTypes ?? ['card'],
      ...(value.metadata ? { metadata: value.metadata } : {}),
    };
    const native = server.stripe.charge(
      parameters as Parameters<typeof server.stripe.charge>[0]
    );
    rails.push({ descriptor, native });
  }

  return { rails, server };
}

function withoutPaymentCredential(request: Request): Request {
  const headers = new Headers(request.headers);
  const authorization = headers.get('Authorization');
  if (authorization && /(?:^|,)\s*Payment\s+/i.test(authorization)) {
    headers.delete('Authorization');
  }
  return new Request(request.url, {
    method: request.method,
    headers,
    ...(!['GET', 'HEAD'].includes(request.method.toUpperCase())
      ? { body: request.clone().body }
      : {}),
    redirect: request.redirect,
  });
}

function withoutAnyPaymentCredential(request: Request): Request {
  const headers = new Headers(withoutPaymentCredential(request).headers);
  headers.delete('PAYMENT-SIGNATURE');
  return new Request(request.url, {
    method: request.method,
    headers,
    ...(!['GET', 'HEAD'].includes(request.method.toUpperCase())
      ? { body: request.clone().body }
      : {}),
    redirect: request.redirect,
  });
}

function nativeTransportRequest(
  rail: RuntimeRail,
  request: Request,
  stripCredential: boolean
): Request {
  const sanitized = stripCredential
    ? withoutAnyPaymentCredential(request)
    : request;
  if (resolveMppMethodImplementation(rail.descriptor) !== 'evm') {
    return sanitized;
  }

  // mppx 0.8.x uses its own body-digest syntax and suppresses the x402
  // compatibility challenge for body-bearing requests without that digest.
  // Lucid binds its RFC 9530 digest into the signed route scope instead, so
  // the native EVM verifier receives a bodyless transport clone.
  return new Request(sanitized.url, {
    method: sanitized.method,
    headers: sanitized.headers,
    redirect: sanitized.redirect,
    signal: sanitized.signal,
  });
}

function hasPaymentCredential(request: Request): boolean {
  const authorization = request.headers.get('Authorization');
  return (
    request.headers.has('PAYMENT-SIGNATURE') ||
    (authorization ? /(?:^|,)\s*Payment(?:\s|$)/i.test(authorization) : false)
  );
}

function configurationResponse(message: string): Response {
  return Response.json(
    {
      error: {
        code: 'mpp_configuration_error',
        message,
      },
    },
    { status: 503 }
  );
}

function paymentProblemResponse(
  challenge: Response,
  code: string,
  title: string,
  detail: string
): Response {
  return Response.json(
    {
      type: `https://paymentauth.org/problems/${code}`,
      title,
      status: 402,
      detail,
    },
    {
      status: 402,
      headers: challenge.headers,
    }
  );
}

type MppTransportSecurity = {
  allowInsecureHttpForDevelopment: boolean;
  trustForwardedProto: boolean;
};

function forwardedProtocol(request: Request): string | undefined {
  const forwarded = request.headers.get('Forwarded')?.split(',')[0];
  if (forwarded) {
    for (const parameter of forwarded.split(';')) {
      const [name, rawValue] = parameter.split('=', 2);
      if (name?.trim().toLowerCase() !== 'proto') continue;
      return rawValue?.trim().replace(/^"|"$/g, '').toLowerCase();
    }
  }
  return request.headers
    .get('X-Forwarded-Proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
}

function isLocalDevelopmentUrl(url: URL): boolean {
  return (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  );
}

function isSecurePaymentRequest(
  request: Request,
  security: MppTransportSecurity
): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  if (security.allowInsecureHttpForDevelopment && isLocalDevelopmentUrl(url)) {
    return true;
  }
  return security.trustForwardedProto && forwardedProtocol(request) === 'https';
}

function insecureTransportResponse(): Response {
  return Response.json(
    {
      type: 'https://paymentauth.org/problems/insecure-transport',
      title: 'Secure Transport Required',
      status: 400,
      detail: 'Payment authentication requires HTTPS.',
    },
    {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/problem+json',
      },
    }
  );
}

async function createMppRuntime(
  config: MppConfig,
  agentName: string,
  security: MppTransportSecurity
): Promise<MppRuntime> {
  if (config.methods.length === 0) {
    throw new Error('MPP config requires at least one payment method');
  }
  const methodIdentities = config.methods.map(
    method => `${method.name}/${resolveMppMethodImplementation(method)}`
  );
  const duplicateMethods = methodIdentities.filter(
    (identity, index, identities) => identities.indexOf(identity) !== index
  );
  if (duplicateMethods.length > 0) {
    throw new Error(
      `MPP methods must be unique by name and implementation; duplicate method${
        duplicateMethods.length === 1 ? '' : 's'
      }: ${[...new Set(duplicateMethods)].join(', ')}`
    );
  }

  let isActive = false;
  const { rails, server } = await materializeRails(config);
  const challengeStore =
    config.challengeStore ?? createInMemoryMppChallengeStore();
  if (challengeStore.durability === 'durable' && !config.secretKey?.trim()) {
    throw new Error(
      'MPP durable challenge storage requires an explicit stable secretKey'
    );
  }
  const realm = config.realm?.trim() || agentName;
  const secretKey = (() => {
    const configured = config.secretKey?.trim();
    if (configured) return configured;
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    throw new Error('MPP requires a secretKey when Web Crypto is unavailable');
  })();
  if (
    rails.some(rail => rail.native) &&
    new TextEncoder().encode(secretKey).byteLength < MIN_SECRET_KEY_BYTES
  ) {
    throw new Error(
      `MPP secretKey must be at least ${MIN_SECRET_KEY_BYTES} bytes for native methods. ` +
        'Generate one with `openssl rand -base64 32` and set MPP_SECRET_KEY.'
    );
  }

  const storedBinding = async (
    challenge: MppWireChallenge,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    binding: RequestBinding
  ): Promise<MppChallengeBinding> => {
    const challengeDigest = await sha256Digest(Challenge.serialize(challenge));
    return {
      entrypointKey: entrypoint.key,
      operation: kind,
      challengeDigest,
      requestMethod: binding.method,
      requestTarget: binding.target,
      ...(binding.bodyDigest ? { requestBodyDigest: binding.bodyDigest } : {}),
    };
  };

  const rememberChallenge = async (
    challenge: MppWireChallenge,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    binding: RequestBinding
  ): Promise<void> => {
    const issuedAt = Date.now();
    const expiresAt = Date.parse(challenge.expires ?? '');
    const result = await challengeStore.issue({
      challengeId: challenge.id,
      binding: await storedBinding(challenge, entrypoint, kind, binding),
      issuedAt,
      expiresAt: Number.isFinite(expiresAt)
        ? expiresAt
        : issuedAt + (config.challengeExpirySeconds ?? 300) * 1000,
    });
    if (result.status === 'capacity') {
      throw new Error('MPP challenge store is at capacity');
    }
  };

  const claimChallenge = async (
    credential: NonNullable<ReturnType<typeof decodeMppCredential>>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    request: Request,
    binding: RequestBinding,
    allowIdempotencyRecovery: boolean
  ): Promise<ChallengeClaim> => {
    const candidateKey = allowIdempotencyRecovery
      ? request.headers.get('Idempotency-Key')?.trim()
      : undefined;
    const idempotencyKey =
      candidateKey && candidateKey.length >= 20 && candidateKey.length <= 256
        ? candidateKey
        : undefined;
    const claimed = await challengeStore.claim({
      challengeId: credential.challengeId,
      binding: await storedBinding(
        credential.challenge as MppWireChallenge,
        entrypoint,
        kind,
        binding
      ),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    if (claimed.status === 'recovered') {
      return {
        state: 'cached',
        authorization: {
          authorized: true,
          receipt: normalizeReceiptHeader(claimed.authorization.receipt),
          ...(claimed.authorization.payer
            ? { payer: claimed.authorization.payer }
            : {}),
          ...(claimed.authorization.network
            ? { network: claimed.authorization.network }
            : {}),
          ...(claimed.authorization.payment
            ? { payment: { ...claimed.authorization.payment } }
            : {}),
          ...(kind === 'invoke' &&
          claimed.authorization.payment?.intent === 'session'
            ? { accounting: { intent: 'charge' as const } }
            : {}),
        },
      };
    }
    if (claimed.status === 'claimed') {
      return {
        state: 'claimed',
        leaseId: claimed.leaseId,
        leaseExpiresAt: claimed.leaseExpiresAt,
        renewAfterMs: claimed.renewAfterMs,
      };
    }
    if (claimed.status === 'in_progress') return { state: 'in_progress' };
    return { state: 'invalid', reason: claimed.reason };
  };

  const claimX402Credential = async (
    paymentSignature: string,
    validBefore: string,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    request: Request,
    binding: RequestBinding,
    allowIdempotencyRecovery: boolean
  ): Promise<{ challengeId: string; claim: ChallengeClaim }> => {
    const challengeDigest = await sha256Digest(paymentSignature);
    const challengeId = `x402:${challengeDigest}`;
    const stored: MppChallengeBinding = {
      entrypointKey: entrypoint.key,
      operation: kind,
      challengeDigest,
      requestMethod: binding.method,
      requestTarget: binding.target,
      ...(binding.bodyDigest ? { requestBodyDigest: binding.bodyDigest } : {}),
    };
    const issuedAt = Date.now();
    const parsedExpiry = Number(validBefore) * 1000;
    const expiresAt =
      Number.isSafeInteger(parsedExpiry) && parsedExpiry > issuedAt
        ? parsedExpiry
        : issuedAt + (config.challengeExpirySeconds ?? 300) * 1000;
    const issued = await challengeStore.issue({
      challengeId,
      binding: stored,
      issuedAt,
      expiresAt,
    });
    if (issued.status === 'capacity') {
      throw new Error('MPP challenge store is at capacity');
    }

    const candidateKey = allowIdempotencyRecovery
      ? request.headers.get('Idempotency-Key')?.trim()
      : undefined;
    const idempotencyKey =
      candidateKey && candidateKey.length >= 20 && candidateKey.length <= 256
        ? candidateKey
        : undefined;
    const claimed = await challengeStore.claim({
      challengeId,
      binding: stored,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    if (claimed.status === 'recovered') {
      return {
        challengeId,
        claim: {
          state: 'cached',
          authorization: {
            authorized: true,
            receipt: normalizeReceiptHeader(claimed.authorization.receipt),
            ...(claimed.authorization.payer
              ? { payer: claimed.authorization.payer }
              : {}),
            ...(claimed.authorization.network
              ? { network: claimed.authorization.network }
              : {}),
            ...(claimed.authorization.payment
              ? { payment: { ...claimed.authorization.payment } }
              : {}),
          },
        },
      };
    }
    if (claimed.status === 'claimed') {
      return {
        challengeId,
        claim: {
          state: 'claimed',
          leaseId: claimed.leaseId,
          leaseExpiresAt: claimed.leaseExpiresAt,
          renewAfterMs: claimed.renewAfterMs,
        },
      };
    }
    if (claimed.status === 'in_progress') {
      return { challengeId, claim: { state: 'in_progress' } };
    }
    return {
      challengeId,
      claim: { state: 'invalid', reason: claimed.reason },
    };
  };

  const completeChallenge = async (
    credential: { challengeId: string },
    leaseId: string,
    authorization: VerifiedMppAuthorization
  ): Promise<VerifiedMppAuthorization> => {
    const consumed = await challengeStore.consume({
      challengeId: credential.challengeId,
      leaseId,
      ...(authorization.receipt
        ? {
            authorization: {
              receipt: authorization.receipt,
              ...(authorization.payer ? { payer: authorization.payer } : {}),
              ...(authorization.network
                ? { network: authorization.network }
                : {}),
              ...(authorization.payment
                ? { payment: { ...authorization.payment } }
                : {}),
            },
          }
        : {}),
    });
    if (consumed.status !== 'consumed') {
      throw new Error('MPP challenge lease could not be consumed');
    }
    return authorization;
  };

  const rejectChallenge = async (
    credential: { challengeId: string },
    leaseId: string
  ): Promise<void> => {
    await challengeStore.consume({
      challengeId: credential.challengeId,
      leaseId,
    });
  };

  const verifyUnderRenewedLease = async <Result>(
    credential: { challengeId: string },
    claim: Extract<ChallengeClaim, { state: 'claimed' }>,
    request: Request,
    verify: (leasedRequest: Request) => Promise<Result>
  ): Promise<Result> => {
    const leaseAbort = new AbortController();
    const signal = AbortSignal.any([request.signal, leaseAbort.signal]);
    const leasedRequest = new Request(request, { signal });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewalInFlight: Promise<void> | undefined;
    let rejectLeaseLoss: (error: Error) => void = () => {};
    const leaseLoss = new Promise<never>((_resolve, reject) => {
      rejectLeaseLoss = reject;
    });

    const scheduleRenewal = (renewAfterMs: number): void => {
      timer = setTimeout(() => {
        renewalInFlight = (async () => {
          const renewed = await challengeStore.renew({
            challengeId: credential.challengeId,
            leaseId: claim.leaseId,
          });
          if (renewed.status !== 'renewed') {
            throw new MppChallengeLeaseLostError();
          }
          if (!stopped) scheduleRenewal(renewed.renewAfterMs);
        })().catch(error => {
          if (stopped) return;
          leaseAbort.abort(error);
          rejectLeaseLoss(
            error instanceof MppChallengeLeaseLostError
              ? error
              : new MppChallengeLeaseLostError()
          );
        });
      }, renewAfterMs);
    };

    scheduleRenewal(claim.renewAfterMs);
    try {
      const result = await Promise.race([verify(leasedRequest), leaseLoss]);
      stopped = true;
      if (timer) clearTimeout(timer);
      await renewalInFlight;
      const fenced = await challengeStore.renew({
        challengeId: credential.challengeId,
        leaseId: claim.leaseId,
      });
      if (fenced.status !== 'renewed') {
        leaseAbort.abort(new MppChallengeLeaseLostError());
        throw new MppChallengeLeaseLostError();
      }
      return result;
    } finally {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };

  const matchingRails = (
    requirement: Extract<MppPaymentRequirement, { required: true }>
  ): RuntimeRail[] =>
    rails.filter(
      rail =>
        requirement.methods.includes(rail.descriptor.name) &&
        (!rail.native || rail.native.intent === requirement.intent)
    );

  const requirementForRail = (
    rail: RuntimeRail,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Extract<MppPaymentRequirement, { required: true }> => {
    const offer = resolveMppOffers(config, entrypoint, kind).find(
      candidate =>
        candidate.method === rail.descriptor.name &&
        candidate.intent === requirement.intent
    );
    return {
      ...requirement,
      amount: offer?.challengeAmount ?? requirement.amount,
      currency: offer?.currency ?? requirement.currency,
      methods: [rail.descriptor.name],
    };
  };

  const challengeWithCustomVerifier = async (
    rail: RuntimeRail,
    binding: RequestBinding,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<Response> => {
    const set = buildChallengeSet({
      amount: requirement.amount,
      currency: requirement.currency,
      intent: requirement.intent,
      methods: [rail.descriptor],
      realm,
      description: requirement.description,
      expirySeconds: config.challengeExpirySeconds,
      digest: binding.bodyDigest,
      meta: { _mppx_scope: bindingScope(entrypoint, kind, binding) },
    });
    await rememberChallenge(set.challenges[0]!, entrypoint, kind, binding);
    return set.response;
  };

  const nativeHandler = (
    rail: RuntimeRail,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    scope: string,
    kind: 'invoke' | 'stream'
  ): ((request: Request) => Promise<NativePaymentResult>) => {
    const native = nativeForRail(rail, kind);
    if (!server || !native) {
      throw new Error('Missing native MPP payment method');
    }
    type NativeMethods = Parameters<typeof server.Mppx.create>[0]['methods'];
    const payment = server.Mppx.create({
      methods: [native] as NativeMethods,
      realm,
      secretKey,
    });
    const paymentMethods = payment as unknown as Record<string, unknown>;
    const methodHandlers = paymentMethods[rail.descriptor.name];
    const factory =
      paymentMethods[requirement.intent] ??
      (methodHandlers && typeof methodHandlers === 'object'
        ? (methodHandlers as Record<string, unknown>)[requirement.intent]
        : undefined);
    if (typeof factory !== 'function') {
      throw new Error(
        `MPP method ${rail.descriptor.name} does not support ${requirement.intent}`
      );
    }
    const descriptorConfig = rail.descriptor.config as Record<string, unknown>;
    const options: Record<string, unknown> = {
      amount: requirement.amount,
      currency: requirement.currency,
      expires: new Date(
        Date.now() + (config.challengeExpirySeconds ?? 300) * 1000
      ).toISOString(),
      ...(requirement.description
        ? { description: requirement.description }
        : {}),
      ...(descriptorConfig.chainId !== undefined
        ? { chainId: descriptorConfig.chainId }
        : {}),
      scope,
    };
    return (factory as NativeHandlerFactory)(options);
  };

  const bindNativeChallenge = (
    challenge: MppWireChallenge,
    binding: RequestBinding,
    scope: string
  ): MppWireChallenge => {
    const {
      id: _id,
      meta: _meta,
      opaque: _opaque,
      digest: _digest,
      ...parameters
    } = challenge;
    return Challenge.from({
      ...parameters,
      secretKey,
      digest: binding.bodyDigest,
      meta: { _mppx_scope: scope },
    }) as MppWireChallenge;
  };

  const replaceChallenge = async (
    response: Response,
    challenge: MppWireChallenge
  ): Promise<Response> => {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('WWW-Authenticate', Challenge.serialize(challenge));
    let body = await response.text();
    if (body && headers.get('Content-Type')?.includes('json')) {
      try {
        const problem = JSON.parse(body) as Record<string, unknown>;
        if (typeof problem === 'object' && problem) {
          problem.challengeId = challenge.id;
          body = JSON.stringify(problem);
        }
      } catch {
        // Preserve a non-JSON upstream body unchanged.
      }
    }
    return new Response(body || null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  const challengeFor = async (
    rail: RuntimeRail,
    request: Request,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<Response> => {
    const railRequirement = requirementForRail(
      rail,
      requirement,
      entrypoint,
      kind
    );
    const binding = await requestBinding(request);
    if (!rail.native) {
      return challengeWithCustomVerifier(
        rail,
        binding,
        railRequirement,
        entrypoint,
        kind
      );
    }
    const scope = bindingScope(entrypoint, kind, binding);
    const result = await nativeHandler(
      rail,
      railRequirement,
      scope,
      kind
    )(nativeTransportRequest(rail, request, true));
    if (result.status !== 402) {
      throw new Error('MPP verifier did not return a payment challenge');
    }
    const challenge = bindNativeChallenge(
      Challenge.fromResponse(result.challenge),
      binding,
      scope
    );
    await rememberChallenge(challenge, entrypoint, kind, binding);
    return replaceChallenge(result.challenge, challenge);
  };

  const challengeForAvailable = async (
    available: RuntimeRail[],
    request: Request,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<Response> => {
    const negotiated = negotiateMppOffers(
      available.map(rail => ({
        rail,
        method: rail.descriptor.name,
        intent: requirement.intent,
      })),
      request.headers.get('Accept-Payment')
    );
    const responses: Response[] = [];
    for (const candidate of negotiated) {
      responses.push(
        await challengeFor(
          candidate.rail,
          request,
          requirement,
          entrypoint,
          kind
        )
      );
    }
    if (responses.length === 1) return responses[0]!;

    const challenges = responses.flatMap(response =>
      Challenge.fromResponseList(response)
    );
    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/problem+json; charset=utf-8',
    });
    for (const challenge of challenges) {
      headers.append('WWW-Authenticate', Challenge.serialize(challenge));
    }
    return Response.json(
      {
        type: 'https://paymentauth.org/problems/payment-required',
        title: 'Payment Required',
        status: 402,
        detail: requirement.description ?? 'This resource requires payment.',
        challenges,
      },
      { status: 402, headers }
    );
  };

  const requirements = (
    entrypoint: EntrypointDef,
    operation: MppPaymentOperation
  ): MppPaymentRequirement => {
    if (!isActive || entrypoint.paymentProtocol === 'x402') {
      return { required: false };
    }
    const kind = operation === 'stream' ? 'stream' : 'invoke';
    const price = resolveEntrypointPrice(entrypoint, kind);
    if (!price) return { required: false };
    const resolvedOffers = resolveMppOffers(config, entrypoint, kind);
    const offers =
      operation === 'task'
        ? resolvedOffers.filter(offer =>
            rails.some(
              rail =>
                rail.descriptor.name === offer.method &&
                resolveMppMethodImplementation(rail.descriptor) !==
                  'tempo-session'
            )
          )
        : resolvedOffers;
    if (
      operation === 'task' &&
      resolvedOffers.length > 0 &&
      offers.length === 0
    ) {
      const intent = resolvedOffers[0]?.intent ?? 'charge';
      throw new Error(`No configured MPP method supports ${intent} tasks`);
    }
    if (offers.length === 0) {
      const entrypointConfig = resolveEntrypointMppConfig(entrypoint);
      return {
        required: true,
        amount: entrypointConfig?.amount ?? price,
        currency: entrypointConfig?.currency ?? config.currency ?? 'usd',
        intent: entrypointConfig?.intent ?? config.defaultIntent ?? 'charge',
        methods:
          entrypointConfig?.methods ??
          config.methods.map(method => method.name),
        ...((entrypointConfig?.description ?? entrypoint.description)
          ? {
              description:
                entrypointConfig?.description ?? entrypoint.description,
            }
          : {}),
      };
    }
    const firstOffer = offers[0]!;

    return {
      required: true,
      amount: firstOffer.challengeAmount,
      currency: firstOffer.currency,
      intent: firstOffer.intent as 'charge' | 'session',
      methods: offers.map(offer => offer.method),
      ...(firstOffer.description
        ? { description: firstOffer.description }
        : {}),
    };
  };

  return {
    get config() {
      return config;
    },
    get isActive() {
      return isActive;
    },
    credentialPurpose(request: Request) {
      const credential = decodeMppCredential(request);
      if (!credential) return undefined;
      const selected = rails.find(
        rail =>
          rail.descriptor.name === credential.challenge.method &&
          credential.challenge.intent === 'session'
      );
      if (
        selected &&
        resolveMppMethodImplementation(selected.descriptor) ===
          'tempo-session' &&
        (credential.payload.action === 'topUp' ||
          credential.payload.action === 'close' ||
          (credential.payload.action === 'voucher' && request.body === null))
      ) {
        return 'management';
      }
      return 'content';
    },
    hasCredential(request: Request) {
      return (
        decodeMppCredential(request) !== null ||
        request.headers.has('PAYMENT-SIGNATURE')
      );
    },
    requirements,
    activate(entrypoint: EntrypointDef) {
      if (!isActive && entrypointRequiresPayment(entrypoint)) isActive = true;
    },
    resolvePrice(entrypoint: EntrypointDef, which: 'invoke' | 'stream') {
      if (entrypoint.paymentProtocol === 'x402') return null;
      return resolveEntrypointPrice(entrypoint, which);
    },
    projectOpenApi(options) {
      return projectMppOpenApi({ ...options, config });
    },
    projectPayment(entrypoint, operation) {
      return projectMppPayment(config, entrypoint, operation);
    },
    openApiComponents() {
      return getMppOpenApiComponents();
    },
    async authorize(
      request: Request,
      entrypoint: EntrypointDef,
      kind: 'invoke' | 'stream',
      resolvedRequirement?: MppPaymentRequirement,
      options?: MppAuthorizationOptions
    ) {
      const requirement = resolvedRequirement ?? requirements(entrypoint, kind);
      if (!requirement.required) return { authorized: true } as const;
      if (!isSecurePaymentRequest(request, security)) {
        return {
          authorized: false,
          response: insecureTransportResponse(),
        } as const;
      }

      const available = matchingRails(requirement);
      if (available.length === 0) {
        return {
          authorized: false,
          response: configurationResponse(
            `No configured MPP method supports ${requirement.intent} for entrypoint "${entrypoint.key}".`
          ),
        } as const;
      }

      const paymentSignature = request.headers.get('PAYMENT-SIGNATURE')?.trim();
      if (paymentSignature) {
        let paymentPayload: ReturnType<
          typeof X402Header.decodePaymentSignature
        >;
        try {
          paymentPayload = X402Header.decodePaymentSignature(paymentSignature);
        } catch {
          return {
            authorized: false,
            response: paymentProblemResponse(
              await challengeForAvailable(
                available,
                request,
                requirement,
                entrypoint,
                kind
              ),
              'malformed-credential',
              'Malformed Credential',
              'The x402 payment credential is malformed.'
            ),
          } as const;
        }

        const selected = available.find(rail => {
          if (resolveMppMethodImplementation(rail.descriptor) !== 'evm') {
            return false;
          }
          const value = rail.descriptor.config as EvmServerConfig;
          const railRequirement = requirementForRail(
            rail,
            requirement,
            entrypoint,
            kind
          );
          return (
            paymentPayload.accepted.scheme === 'exact' &&
            paymentPayload.accepted.network === `eip155:${value.chainId}` &&
            paymentPayload.accepted.asset.toLowerCase() ===
              value.currency.toLowerCase() &&
            paymentPayload.accepted.payTo.toLowerCase() ===
              value.recipient.toLowerCase() &&
            paymentPayload.accepted.amount ===
              mppBaseUnits(railRequirement.amount, value.decimals)
          );
        });
        if (!selected?.native) {
          return {
            authorized: false,
            response: paymentProblemResponse(
              await challengeForAvailable(
                available,
                request,
                requirement,
                entrypoint,
                kind
              ),
              'invalid-challenge',
              'Invalid Challenge',
              'The x402 credential does not match an available EVM payment offer.'
            ),
          } as const;
        }

        const authorization =
          'authorization' in paymentPayload.payload
            ? paymentPayload.payload.authorization
            : undefined;
        if (!authorization) {
          return {
            authorized: false,
            response: paymentProblemResponse(
              await challengeForAvailable(
                available,
                request,
                requirement,
                entrypoint,
                kind
              ),
              'verification-failed',
              'Verification Failed',
              'The x402 credential does not contain an EIP-3009 authorization.'
            ),
          } as const;
        }

        const selectedRequirement = requirementForRail(
          selected,
          requirement,
          entrypoint,
          kind
        );
        const selectedPayment: MppPaymentSelection = {
          amount: selectedRequirement.amount,
          currency: selectedRequirement.currency,
          intent: selectedRequirement.intent,
          method: selected.descriptor.name,
        };
        const binding = await requestBinding(request);
        let claimed: Awaited<ReturnType<typeof claimX402Credential>>;
        try {
          claimed = await claimX402Credential(
            paymentSignature,
            authorization.validBefore,
            entrypoint,
            kind,
            request,
            binding,
            options?.allowIdempotencyRecovery === true
          );
        } catch {
          return {
            authorized: false,
            response: configurationResponse(
              'MPP replay protection is temporarily unavailable.'
            ),
          } as const;
        }
        const syntheticCredential = {
          challengeId: claimed.challengeId,
        };
        if (claimed.claim.state === 'cached') {
          return {
            ...claimed.claim.authorization,
            payment: claimed.claim.authorization.payment ?? selectedPayment,
          };
        }
        if (claimed.claim.state === 'in_progress') {
          return {
            authorized: false,
            response: Response.json(
              {
                error: {
                  code: 'mpp_verification_in_progress',
                  message: 'Payment verification is already in progress.',
                },
              },
              { status: 409, headers: { 'Retry-After': '1' } }
            ),
          } as const;
        }
        if (claimed.claim.state === 'invalid') {
          return {
            authorized: false,
            response: paymentProblemResponse(
              await challengeForAvailable(
                available,
                request,
                requirement,
                entrypoint,
                kind
              ),
              claimed.claim.reason === 'expired'
                ? 'payment-expired'
                : 'invalid-challenge',
              claimed.claim.reason === 'expired'
                ? 'Payment Expired'
                : 'Invalid Challenge',
              'The x402 payment credential is expired, already used, or does not match this request.'
            ),
          } as const;
        }
        try {
          const denied = await options?.preflightPayment?.(selectedPayment);
          if (denied) {
            await rejectChallenge(syntheticCredential, claimed.claim.leaseId);
            return { authorized: false, response: denied } as const;
          }
        } catch {
          await rejectChallenge(syntheticCredential, claimed.claim.leaseId);
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment policy preflight is temporarily unavailable.'
            ),
          } as const;
        }

        let result: NativePaymentResult;
        try {
          result = await verifyUnderRenewedLease(
            syntheticCredential,
            claimed.claim,
            request,
            leasedRequest =>
              nativeHandler(
                selected,
                selectedRequirement,
                bindingScope(entrypoint, kind, binding),
                kind
              )(nativeTransportRequest(selected, leasedRequest, false))
          );
        } catch {
          // Once a signed x402 credential reaches the settlement rail, fail
          // closed instead of risking a second facilitator settlement.
          await rejectChallenge(syntheticCredential, claimed.claim.leaseId);
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment verification is temporarily unavailable.'
            ),
          } as const;
        }
        if (result.status === 402) {
          await rejectChallenge(syntheticCredential, claimed.claim.leaseId);
          const challenge = bindNativeChallenge(
            Challenge.fromResponse(result.challenge),
            binding,
            bindingScope(entrypoint, kind, binding)
          );
          await rememberChallenge(challenge, entrypoint, kind, binding);
          return {
            authorized: false,
            response: await replaceChallenge(result.challenge, challenge),
          } as const;
        }
        try {
          const marker = new Response(null, {
            status: 299,
            headers: { [CONTENT_RESPONSE_MARKER]: 'true' },
          });
          const receiptResponse = result.withReceipt(marker);
          const receipt = normalizeReceiptHeader(
            receiptResponse.headers.get('Payment-Receipt') ?? undefined
          );
          const paymentResponse =
            receiptResponse.headers.get('PAYMENT-RESPONSE');
          const handled = receiptResponse.headers.has(CONTENT_RESPONSE_MARKER)
            ? undefined
            : receiptResponse;
          return completeChallenge(syntheticCredential, claimed.claim.leaseId, {
            authorized: true,
            receipt,
            payer: authorization.from,
            network: paymentPayload.accepted.network,
            payment: selectedPayment,
            ...(paymentResponse
              ? {
                  responseHeaders: {
                    'PAYMENT-RESPONSE': paymentResponse,
                  },
                }
              : {}),
            ...(handled ? { handled } : {}),
          });
        } catch {
          await rejectChallenge(syntheticCredential, claimed.claim.leaseId);
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment receipt processing failed.'
            ),
          } as const;
        }
      }

      const credential = decodeMppCredential(request);
      const selected = credential
        ? available.find(
            rail =>
              rail.descriptor.name === credential.challenge.method &&
              credential.challenge.intent === requirement.intent &&
              (!rail.native ||
                rail.native.intent === credential.challenge.intent)
          )
        : available[0];

      if (!credential) {
        try {
          const fresh = await challengeForAvailable(
            available,
            request,
            requirement,
            entrypoint,
            kind
          );
          return {
            authorized: false,
            response: hasPaymentCredential(request)
              ? paymentProblemResponse(
                  fresh,
                  'malformed-credential',
                  'Malformed Credential',
                  'The Payment credential is malformed.'
                )
              : fresh,
          } as const;
        } catch {
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment challenge is temporarily unavailable.'
            ),
          } as const;
        }
      }
      if (!selected) {
        return {
          authorized: false,
          response: paymentProblemResponse(
            await challengeForAvailable(
              available,
              request,
              requirement,
              entrypoint,
              kind
            ),
            'invalid-challenge',
            'Invalid Challenge',
            'The credential references an unsupported payment challenge.'
          ),
        } as const;
      }
      const selectedRequirement = requirementForRail(
        selected,
        requirement,
        entrypoint,
        kind
      );
      const selectedPayment =
        available.length > 1 ||
        resolveMppMethodImplementation(selected.descriptor) === 'evm' ||
        resolveMppMethodImplementation(selected.descriptor) === 'tempo-session'
          ? {
              amount:
                resolveMppMethodImplementation(selected.descriptor) ===
                  'tempo-session' && kind === 'stream'
                  ? (selected.descriptor.config as TempoSessionServerConfig)
                      .deposit.maximum
                  : selectedRequirement.amount,
              currency: selectedRequirement.currency,
              intent: selectedRequirement.intent,
              method: selected.descriptor.name,
            }
          : undefined;
      const preflightPayment: MppPaymentSelection = selectedPayment ?? {
        amount: selectedRequirement.amount,
        currency: selectedRequirement.currency,
        intent: selectedRequirement.intent,
        method: selected.descriptor.name,
      };
      if (credential.challenge.digest) {
        const actualDigest = await requestBodyDigest(request);
        if (actualDigest !== credential.challenge.digest) {
          return {
            authorized: false,
            response: paymentProblemResponse(
              await challengeForAvailable(
                available,
                request,
                requirement,
                entrypoint,
                kind
              ),
              'verification-failed',
              'Verification Failed',
              'The request body does not match the payment challenge.'
            ),
          } as const;
        }
      }

      const binding = await requestBinding(request);
      const claim = await claimChallenge(
        credential,
        entrypoint,
        kind,
        request,
        binding,
        options?.allowIdempotencyRecovery === true
      );
      if (claim.state === 'cached') {
        return {
          ...claim.authorization,
          ...(claim.authorization.payment
            ? { payment: claim.authorization.payment }
            : selectedPayment
              ? { payment: selectedPayment }
              : {}),
        };
      }
      if (claim.state === 'in_progress') {
        return {
          authorized: false,
          response: Response.json(
            {
              error: {
                code: 'mpp_verification_in_progress',
                message: 'Payment verification is already in progress.',
              },
            },
            { status: 409, headers: { 'Retry-After': '1' } }
          ),
        } as const;
      }
      if (claim.state === 'invalid') {
        const expired = claim.reason === 'expired';
        return {
          authorized: false,
          response: paymentProblemResponse(
            await challengeForAvailable(
              available,
              request,
              requirement,
              entrypoint,
              kind
            ),
            expired ? 'payment-expired' : 'invalid-challenge',
            expired ? 'Payment Expired' : 'Invalid Challenge',
            expired
              ? 'The payment challenge has expired.'
              : 'The payment challenge is unknown, already used, or does not match this request.'
          ),
        } as const;
      }
      try {
        const denied = await options?.preflightPayment?.(preflightPayment);
        if (denied) {
          await rejectChallenge(credential, claim.leaseId);
          return { authorized: false, response: denied } as const;
        }
      } catch {
        await rejectChallenge(credential, claim.leaseId);
        return {
          authorized: false,
          response: configurationResponse(
            'MPP payment policy preflight is temporarily unavailable.'
          ),
        } as const;
      }

      if (!selected.native) {
        if (!config.verifyCredential) {
          await rejectChallenge(credential, claim.leaseId);
          return {
            authorized: false,
            response: await challengeWithCustomVerifier(
              selected,
              binding,
              selectedRequirement,
              entrypoint,
              kind
            ),
          } as const;
        }
        let verification: Awaited<ReturnType<typeof config.verifyCredential>>;
        try {
          verification = await verifyUnderRenewedLease(
            credential,
            claim,
            request,
            leasedRequest =>
              Promise.resolve(
                config.verifyCredential!({
                  request: leasedRequest,
                  entrypoint,
                  kind,
                  requirement: selectedRequirement,
                  credential,
                })
              )
          );
        } catch {
          // The verifier may have committed payment before failing. Consume
          // ambiguous credentials so a retry cannot settle them twice.
          await rejectChallenge(credential, claim.leaseId);
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment verification is temporarily unavailable.'
            ),
          } as const;
        }
        if (verification.valid === false) {
          await rejectChallenge(credential, claim.leaseId);
          const fresh = await challengeWithCustomVerifier(
            selected,
            binding,
            selectedRequirement,
            entrypoint,
            kind
          );
          return {
            authorized: false,
            response: paymentProblemResponse(
              fresh,
              'verification-failed',
              'Verification Failed',
              verification.reason
                ? `Payment verification failed: ${verification.reason}.`
                : 'Payment verification failed.'
            ),
          } as const;
        }
        let receipt: string;
        try {
          receipt = normalizeReceiptHeader(verification.receipt);
        } catch {
          // valid:true asserts that settlement succeeded. Consume this
          // credential so an invalid receipt cannot trigger a second charge.
          await rejectChallenge(credential, claim.leaseId);
          return {
            authorized: false,
            response: configurationResponse(
              'MPP payment receipt processing failed.'
            ),
          } as const;
        }
        return completeChallenge(credential, claim.leaseId, {
          authorized: true,
          receipt,
          ...(verification.payer ? { payer: verification.payer } : {}),
          ...(verification.network ? { network: verification.network } : {}),
          ...(selectedPayment ? { payment: selectedPayment } : {}),
        });
      }

      let result: NativePaymentResult;
      try {
        result = await verifyUnderRenewedLease(
          credential,
          claim,
          request,
          leasedRequest =>
            nativeHandler(
              selected,
              selectedRequirement,
              bindingScope(entrypoint, kind, binding),
              kind
            )(nativeTransportRequest(selected, leasedRequest, false))
        );
      } catch {
        // A native verifier may have committed settlement before surfacing a
        // transport or receipt error. Consume the credential on ambiguity so
        // a retry cannot charge the payer twice.
        await rejectChallenge(credential, claim.leaseId);
        return {
          authorized: false,
          response: configurationResponse(
            'MPP payment verification is temporarily unavailable.'
          ),
        } as const;
      }
      if (result.status === 402) {
        await rejectChallenge(credential, claim.leaseId);
        const challenge = bindNativeChallenge(
          Challenge.fromResponse(result.challenge),
          binding,
          bindingScope(entrypoint, kind, binding)
        );
        await rememberChallenge(challenge, entrypoint, kind, binding);
        return {
          authorized: false,
          response: await replaceChallenge(result.challenge, challenge),
        } as const;
      }
      try {
        const marker = new Response(null, {
          status: 299,
          headers: {
            [CONTENT_RESPONSE_MARKER]: 'true',
            ...(kind === 'stream' &&
            resolveMppMethodImplementation(selected.descriptor) ===
              'tempo-session'
              ? { 'Content-Type': 'text/event-stream; charset=utf-8' }
              : {}),
          },
        });
        const receiptResponse = result.withReceipt(marker);
        const receipt = normalizeReceiptHeader(
          receiptResponse.headers.get('Payment-Receipt') ?? undefined
        );
        const handled = receiptResponse.headers.has(CONTENT_RESPONSE_MARKER)
          ? undefined
          : receiptResponse;
        const tempoReceipt =
          resolveMppMethodImplementation(selected.descriptor) ===
          'tempo-session'
            ? sessionReceipt(receipt)
            : undefined;
        if (
          resolveMppMethodImplementation(selected.descriptor) ===
            'tempo-session' &&
          !tempoReceipt
        ) {
          throw new Error('Tempo session verifier returned an invalid receipt');
        }
        const sessionMeter =
          kind === 'stream' && !handled && tempoReceipt && selected.session
            ? createTempoSessionMeter({
                store: selected.session.store,
                channelId: tempoReceipt.channelId,
                challengeId: tempoReceipt.challengeId,
                tickCost: selected.session.tickCost,
                maximumAmount: BigInt(
                  mppBaseUnits(
                    selected.session.config.deposit.maximum,
                    selected.session.config.decimals
                  )
                ),
                unitType: selected.session.config.unitType,
                prepaidUnits: 1,
                ...(selected.session.config.topUpWait?.timeoutMs !== undefined
                  ? {
                      timeoutMs: selected.session.config.topUpWait.timeoutMs,
                    }
                  : {}),
                ...(selected.session.config.topUpWait?.pollIntervalMs !==
                undefined
                  ? {
                      pollIntervalMs:
                        selected.session.config.topUpWait.pollIntervalMs,
                    }
                  : {}),
              })
            : undefined;
        const accounting: MppAccountingDisposition | undefined =
          resolveMppMethodImplementation(selected.descriptor) ===
          'tempo-session'
            ? sessionMeter
              ? {
                  intent: 'session',
                  reference: sessionMeter.channelId,
                  maximumAmount: sessionMeter.maximumAmount,
                }
              : { intent: 'charge' }
            : undefined;
        return completeChallenge(credential, claim.leaseId, {
          authorized: true,
          receipt,
          ...(resolveMppMethodImplementation(selected.descriptor) === 'evm' &&
          typeof credential.payload.from === 'string'
            ? {
                payer: credential.payload.from,
                network: `eip155:${(selected.descriptor.config as EvmServerConfig).chainId}`,
              }
            : {}),
          ...(resolveMppMethodImplementation(selected.descriptor) ===
          'tempo-session'
            ? {
                ...(credential.source ? { payer: credential.source } : {}),
                network: `eip155:${(selected.descriptor.config as TempoSessionServerConfig).chainId}`,
              }
            : {}),
          ...(handled ? { handled } : {}),
          ...(selectedPayment ? { payment: selectedPayment } : {}),
          ...(accounting ? { accounting } : {}),
          ...(sessionMeter ? { sessionMeter } : {}),
        });
      } catch {
        // status:200 means the native rail accepted the payment. Consume this
        // credential if receipt construction fails to prevent re-settlement.
        await rejectChallenge(credential, claim.leaseId);
        return {
          authorized: false,
          response: configurationResponse(
            'MPP payment receipt processing failed.'
          ),
        } as const;
      }
    },
    async getMppFetch(clientConfig: MppClientConfig) {
      if (clientConfig.methods.length === 0) {
        console.warn(
          '[lucid-agents/mpp] At least one native mppx client method is required'
        );
        return null;
      }
      try {
        const { Mppx } = await import('mppx/client');
        type NativeMethods = Parameters<typeof Mppx.create>[0]['methods'];
        const mppxClient = Mppx.create({
          methods: clientConfig.methods as NativeMethods,
          fetch: clientConfig.fetch as typeof globalThis.fetch | undefined,
          polyfill: false,
        });
        return mppxClient.fetch.bind(mppxClient) as FetchFunction;
      } catch (error) {
        console.warn(
          '[lucid-agents/mpp] Failed to create MPP fetch client:',
          (error as Error)?.message ?? error
        );
        return null;
      }
    },
  };
}

export type MppExtensionOptions = {
  /** MPP configuration. Pass `false` to explicitly disable. */
  config?: MppConfig | false;
  /** Permit plaintext HTTP only for localhost development requests. */
  allowInsecureHttpForDevelopment?: boolean;
  /** Trust Forwarded/X-Forwarded-Proto from a sanitizing reverse proxy. */
  trustForwardedProto?: boolean;
};

/** Create the Machine Payments Protocol extension. */
export function mpp(
  options?: MppExtensionOptions
): Extension<{ mpp?: MppRuntime }> {
  let mppRuntime: MppRuntime | undefined;
  let challengeStore: MppChallengeStore | undefined;
  const sessionStores = new Set<TempoSessionStore>();

  return {
    name: 'mpp',
    async build(ctx: BuildContext): Promise<{ mpp?: MppRuntime }> {
      if (options?.config === false) return {};
      if (!options?.config) {
        throw new Error(
          'mpp() requires a config. Pass config from mppFromEnv(), or pass ' +
            '{ config: false } to explicitly disable the extension.'
        );
      }
      challengeStore =
        options.config.challengeStore ?? createInMemoryMppChallengeStore();
      const methods = options.config.methods.map(method => {
        if (resolveMppMethodImplementation(method) !== 'tempo-session') {
          return method;
        }
        const sessionConfig = method.config as TempoSessionServerConfig;
        const store = sessionConfig.store ?? createInMemoryTempoSessionStore();
        sessionStores.add(store);
        return {
          ...method,
          config: { ...sessionConfig, store },
        };
      });
      const config = { ...options.config, methods, challengeStore };
      mppRuntime = await createMppRuntime(config, ctx.meta.name, {
        allowInsecureHttpForDevelopment:
          options.allowInsecureHttpForDevelopment === true,
        trustForwardedProto: options.trustForwardedProto === true,
      });
      return { mpp: mppRuntime };
    },
    onEntrypointAdded(entrypoint: EntrypointDef, _runtime: AgentRuntime) {
      mppRuntime?.activate(entrypoint);
    },
    onManifestBuild(card: AgentManifest, runtime: AgentRuntime): AgentManifest {
      if (!mppRuntime) return card;
      return buildManifestWithMpp(
        card,
        mppRuntime.config,
        runtime.entrypoints.snapshot()
      );
    },
    async dispose() {
      await challengeStore?.close?.();
      await Promise.all(
        [...sessionStores].map(store => store.close?.() ?? Promise.resolve())
      );
      sessionStores.clear();
    },
  };
}
