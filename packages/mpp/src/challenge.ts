import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  EntrypointMppConfig,
  EvmServerConfig,
  MppPaymentIntent,
  MppPaymentMethod,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
} from '@lucid-agents/types/mpp';
import { Challenge } from 'mppx';

/** A standards-compliant Payment-Auth challenge emitted on the wire. */
export type MppWireChallenge = Challenge.Challenge<Record<string, unknown>>;

export type ChallengeBuildOptions = {
  amount: string;
  currency: string;
  intent: MppPaymentIntent;
  methods: Array<MppPaymentMethod | MppServerMethod>;
  realm?: string;
  description?: string;
  expirySeconds?: number;
  digest?: string;
  meta?: Record<string, string>;
};

/** Challenge objects plus their HTTP response representation. */
export type MppChallengeSet = {
  challenges: MppWireChallenge[];
  response: Response;
};

function generateChallengeId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  throw new Error('MPP requires Web Crypto randomUUID support');
}

function sanitizeDescription(value: string | undefined): string | undefined {
  return value?.replace(/[\u0000-\u001f\u007f]/g, ' ');
}

export function mppBaseUnits(amount: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid MPP currency decimals: ${decimals}`);
  }
  const match = amount.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`Invalid MPP amount: ${amount}`);
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > decimals && /[1-9]/.test(fraction.slice(decimals))) {
    throw new Error(
      `MPP amount ${amount} has more than ${decimals} decimal places`
    );
  }
  const padded = fraction.slice(0, decimals).padEnd(decimals, '0');
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(padded || '0')
  ).toString();
}

function methodName(method: MppPaymentMethod | MppServerMethod): string {
  return typeof method === 'string' ? method : method.name;
}

function methodRequest(
  method: MppPaymentMethod | MppServerMethod,
  amount: string,
  currency: string,
  expires: string
): Record<string, unknown> {
  if (typeof method === 'string') return { amount, currency, expires };

  if (method.implementation === 'tempo') {
    const config = method.config as TempoServerConfig;
    const methodDetails: Record<string, unknown> = {};
    if (config.chainId !== undefined) methodDetails.chainId = config.chainId;
    return {
      amount: mppBaseUnits(amount, config.decimals ?? 6),
      currency,
      recipient: config.recipient,
      expires,
      ...(Object.keys(methodDetails).length > 0 ? { methodDetails } : {}),
    };
  }

  if (method.implementation === 'stripe') {
    const config = method.config as StripeServerConfig;
    return {
      amount: mppBaseUnits(amount, config.decimals ?? 2),
      currency,
      expires,
      methodDetails: {
        networkId: config.networkId,
        paymentMethodTypes: config.paymentMethodTypes ?? ['card'],
        ...(config.metadata ? { metadata: config.metadata } : {}),
      },
    };
  }

  if (method.implementation === 'evm') {
    const config = method.config as EvmServerConfig;
    return {
      amount: mppBaseUnits(amount, config.decimals),
      currency,
      recipient: config.recipient,
      expires,
      methodDetails: {
        chainId: config.chainId,
        credentialTypes: ['authorization'],
        decimals: config.decimals,
      },
    };
  }

  return {
    ...(method.config as Record<string, unknown>),
    amount,
    currency,
    expires,
  };
}

/** Build standard Payment-Auth challenge objects and the corresponding 402. */
export function buildChallengeSet(
  options: ChallengeBuildOptions
): MppChallengeSet {
  const {
    amount,
    currency,
    intent,
    methods,
    realm = 'Lucid Agent',
    description,
    expirySeconds = 300,
    digest,
    meta,
  } = options;
  const expires = new Date(Date.now() + expirySeconds * 1000).toISOString();
  const challenges = methods.map(method =>
    Challenge.from({
      id: generateChallengeId(),
      realm,
      method: methodName(method),
      intent,
      request: methodRequest(method, amount, currency, expires),
      description: sanitizeDescription(description),
      digest,
      expires,
      meta,
    })
  ) as MppWireChallenge[];

  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/problem+json; charset=utf-8',
  });
  for (const challenge of challenges) {
    headers.append('WWW-Authenticate', Challenge.serialize(challenge));
  }

  return {
    challenges,
    response: Response.json(
      {
        type: 'https://paymentauth.org/problems/payment-required',
        title: 'Payment Required',
        status: 402,
        detail: description ?? 'This resource requires payment.',
        challenges,
      },
      { status: 402, headers }
    ),
  };
}

/** Build a standards-compliant MPP `402 Payment Required` response. */
export function buildChallengeResponse(
  options: ChallengeBuildOptions
): Response {
  return buildChallengeSet(options).response;
}

export function resolveEntrypointPrice(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): string | null {
  if (entrypoint.paymentProtocol === 'x402') return null;
  const { price } = entrypoint;
  if (!price) return null;

  if (typeof price === 'string') {
    return price.trim().length > 0 ? price : null;
  }

  const value = kind === 'stream' ? price.stream : price.invoke;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function resolveEntrypointMppConfig(
  entrypoint: EntrypointDef
): EntrypointMppConfig | undefined {
  return entrypoint.metadata?.mpp as EntrypointMppConfig | undefined;
}
