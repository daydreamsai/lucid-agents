import type {
  AgentManifest,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type { FetchFunction } from '@lucid-agents/types/http';
import type {
  MppClientConfig,
  MppConfig,
  MppPaymentRequirement,
  MppRuntime,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
} from '@lucid-agents/types/mpp';
import { Challenge, type Method } from 'mppx';

import {
  buildChallengeSet,
  resolveEntrypointMppConfig,
  resolveEntrypointPrice,
  type MppWireChallenge,
} from './challenge';
import { buildManifestWithMpp } from './manifest';
import { decodeMppCredential } from './middleware';

const MAX_OUTSTANDING_CHALLENGES = 10_000;
const CONTENT_RESPONSE_MARKER = 'x-lucid-mpp-content-response';
const MAX_RECEIPT_HEADER_BYTES = 8 * 1024;

type NativeServerIntent = Method.AnyServer;
type RuntimeRail = {
  descriptor: MppServerMethod;
  native?: NativeServerIntent;
};
type ChallengeRecord = {
  challenge: MppWireChallenge;
  entrypointKey: string;
  kind: 'invoke' | 'stream';
  expiresAt: number;
  state: 'issued' | 'verifying' | 'verified';
  idempotencyKey?: string;
  authorization?: VerifiedMppAuthorization;
};
type VerifiedMppAuthorization = {
  authorized: true;
  receipt?: string;
  payer?: string;
  network?: string;
  handled?: Response;
};
type ChallengeClaim =
  | { state: 'claimed' }
  | { state: 'cached'; authorization: VerifiedMppAuthorization }
  | { state: 'in_progress' }
  | { state: 'invalid' };
type NativePaymentResult =
  | { status: 402; challenge: Response }
  | {
      status: 200;
      withReceipt: (response?: Response) => Response;
    };
type NativeHandlerFactory = (
  options: Record<string, unknown>
) => (request: Request) => Promise<NativePaymentResult>;

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

function implementationOf(
  method: MppServerMethod
): 'tempo' | 'stripe' | 'custom' {
  if (method.implementation) return method.implementation;
  if (method.name === 'tempo') return 'tempo';
  if (method.name === 'stripe') return 'stripe';
  return 'custom';
}

async function materializeRails(config: MppConfig): Promise<{
  rails: RuntimeRail[];
  server?: typeof import('mppx/server');
}> {
  const needsNative = config.methods.some(
    method => implementationOf(method) !== 'custom'
  );
  const server = needsNative ? await import('mppx/server') : undefined;
  const rails: RuntimeRail[] = [];

  for (const descriptor of config.methods) {
    const implementation = implementationOf(descriptor);
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
        ...(value.testnet !== undefined ? { testnet: value.testnet } : {}),
      };
      // mppx 0.4 sessions require a signing account that TempoServerConfig does
      // not expose. Materialize charge explicitly so an unused session rail
      // cannot make a charge-only merchant fail during startup.
      const native = server.tempo.charge(
        parameters as Parameters<typeof server.tempo.charge>[0]
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
    const nativeMethods = server.stripe(
      parameters as Parameters<typeof server.stripe>[0]
    );
    for (const native of nativeMethods) rails.push({ descriptor, native });
  }

  return { rails, server };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutPaymentCredential(request: Request): Request {
  const headers = new Headers(request.headers);
  const authorization = headers.get('Authorization');
  if (authorization && /(?:^|,)\s*Payment\s+/i.test(authorization)) {
    headers.delete('Authorization');
  }
  return new Request(request, { headers });
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

async function createMppRuntime(
  config: MppConfig,
  agentName: string
): Promise<MppRuntime> {
  if (config.methods.length === 0) {
    throw new Error('MPP config requires at least one payment method');
  }

  let isActive = false;
  const { rails, server } = await materializeRails(config);
  const outstandingChallenges = new Map<string, ChallengeRecord>();
  const realm = config.realm?.trim() || agentName;
  const secretKey = (() => {
    const configured = config.secretKey?.trim();
    if (configured) return configured;
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    throw new Error('MPP requires a secretKey when Web Crypto is unavailable');
  })();

  const pruneChallenges = (): void => {
    const now = Date.now();
    for (const [id, record] of outstandingChallenges) {
      if (record.expiresAt <= now) outstandingChallenges.delete(id);
    }
    while (outstandingChallenges.size >= MAX_OUTSTANDING_CHALLENGES) {
      const oldest = outstandingChallenges.keys().next().value;
      if (typeof oldest !== 'string') break;
      outstandingChallenges.delete(oldest);
    }
  };

  const rememberChallenge = (
    challenge: MppWireChallenge,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): void => {
    pruneChallenges();
    const expiresAt = Date.parse(challenge.expires ?? '');
    outstandingChallenges.set(challenge.id, {
      challenge,
      entrypointKey: entrypoint.key,
      kind,
      state: 'issued',
      expiresAt: Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + (config.challengeExpirySeconds ?? 300) * 1000,
    });
  };

  const claimChallenge = (
    credential: NonNullable<ReturnType<typeof decodeMppCredential>>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    request: Request,
    allowIdempotencyRecovery: boolean
  ): ChallengeClaim => {
    const record = outstandingChallenges.get(credential.challengeId);
    if (!record) return { state: 'invalid' };
    if (
      record.expiresAt <= Date.now() ||
      record.entrypointKey !== entrypoint.key ||
      record.kind !== kind ||
      canonicalJson(record.challenge) !== canonicalJson(credential.challenge)
    ) {
      outstandingChallenges.delete(credential.challengeId);
      return { state: 'invalid' };
    }
    const candidateKey = allowIdempotencyRecovery
      ? request.headers.get('Idempotency-Key')?.trim()
      : undefined;
    const idempotencyKey =
      candidateKey && candidateKey.length >= 20 && candidateKey.length <= 256
        ? candidateKey
        : undefined;
    if (record.state === 'verified') {
      if (
        idempotencyKey &&
        record.idempotencyKey === idempotencyKey &&
        record.authorization
      ) {
        return {
          state: 'cached',
          authorization: {
            ...record.authorization,
            ...(record.authorization.handled
              ? { handled: record.authorization.handled.clone() }
              : {}),
          },
        };
      }
      return { state: 'invalid' };
    }
    if (record.state === 'verifying') return { state: 'in_progress' };

    // Fence concurrent replay before verification or settlement begins.
    record.state = 'verifying';
    if (idempotencyKey) record.idempotencyKey = idempotencyKey;
    return { state: 'claimed' };
  };

  const completeChallenge = (
    credential: NonNullable<ReturnType<typeof decodeMppCredential>>,
    authorization: VerifiedMppAuthorization
  ): VerifiedMppAuthorization => {
    const record = outstandingChallenges.get(credential.challengeId);
    if (!record || record.state !== 'verifying') return authorization;
    if (!record.idempotencyKey) {
      outstandingChallenges.delete(credential.challengeId);
      return authorization;
    }
    record.state = 'verified';
    record.authorization = {
      ...authorization,
      ...(authorization.handled
        ? { handled: authorization.handled.clone() }
        : {}),
    };
    return authorization;
  };

  const rejectChallenge = (
    credential: NonNullable<ReturnType<typeof decodeMppCredential>>
  ): void => {
    outstandingChallenges.delete(credential.challengeId);
  };

  const releaseChallengeClaim = (
    credential: NonNullable<ReturnType<typeof decodeMppCredential>>
  ): void => {
    const record = outstandingChallenges.get(credential.challengeId);
    if (record?.state === 'verifying') record.state = 'issued';
  };

  const matchingRails = (
    requirement: Extract<MppPaymentRequirement, { required: true }>
  ): RuntimeRail[] =>
    rails.filter(
      rail =>
        requirement.methods.includes(rail.descriptor.name) &&
        (!rail.native || rail.native.intent === requirement.intent)
    );

  const challengeWithCustomVerifier = (
    rail: RuntimeRail,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Response => {
    const set = buildChallengeSet({
      amount: requirement.amount,
      currency: requirement.currency,
      intent: requirement.intent,
      methods: [rail.descriptor],
      realm,
      description: requirement.description,
      expirySeconds: config.challengeExpirySeconds,
    });
    rememberChallenge(set.challenges[0]!, entrypoint, kind);
    return set.response;
  };

  const nativeHandler = (
    rail: RuntimeRail,
    requirement: Extract<MppPaymentRequirement, { required: true }>
  ): ((request: Request) => Promise<NativePaymentResult>) => {
    if (!server || !rail.native) {
      throw new Error('Missing native MPP payment method');
    }
    type NativeMethods = Parameters<typeof server.Mppx.create>[0]['methods'];
    const payment = server.Mppx.create({
      methods: [rail.native] as NativeMethods,
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
    };
    return (factory as NativeHandlerFactory)(options);
  };

  const challengeFor = async (
    rail: RuntimeRail,
    request: Request,
    requirement: Extract<MppPaymentRequirement, { required: true }>,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<Response> => {
    if (!rail.native) {
      return challengeWithCustomVerifier(rail, requirement, entrypoint, kind);
    }
    const result = await nativeHandler(
      rail,
      requirement
    )(withoutPaymentCredential(request));
    if (result.status !== 402) {
      throw new Error('MPP verifier did not return a payment challenge');
    }
    const challenge = Challenge.fromResponse(result.challenge);
    rememberChallenge(challenge, entrypoint, kind);
    return result.challenge;
  };

  const requirements = (
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): MppPaymentRequirement => {
    if (!isActive || entrypoint.paymentProtocol === 'x402') {
      return { required: false };
    }
    const price = resolveEntrypointPrice(entrypoint, kind);
    if (!price) return { required: false };

    const entrypointConfig = resolveEntrypointMppConfig(entrypoint);
    const intent = entrypointConfig?.intent ?? config.defaultIntent ?? 'charge';
    const configured = rails
      .filter(rail => !rail.native || rail.native.intent === intent)
      .map(rail => rail.descriptor.name);
    const methods = [...new Set(entrypointConfig?.methods ?? configured)];
    const firstRail = rails.find(
      rail =>
        methods.includes(rail.descriptor.name) &&
        (!rail.native || rail.native.intent === intent)
    );
    const methodCurrency = (
      firstRail?.descriptor.config as { currency?: unknown } | undefined
    )?.currency;
    const currency =
      entrypointConfig?.currency ??
      (typeof methodCurrency === 'string' ? methodCurrency : undefined) ??
      config.currency ??
      'usd';

    return {
      required: true,
      amount: entrypointConfig?.amount ?? price,
      currency,
      intent,
      methods,
      description: entrypointConfig?.description ?? entrypoint.description,
    };
  };

  return {
    get config() {
      return config;
    },
    get isActive() {
      return isActive;
    },
    hasCredential(request: Request) {
      return decodeMppCredential(request) !== null;
    },
    requirements,
    activate(entrypoint: EntrypointDef) {
      if (!isActive && entrypointRequiresPayment(entrypoint)) isActive = true;
    },
    resolvePrice(entrypoint: EntrypointDef, which: 'invoke' | 'stream') {
      if (entrypoint.paymentProtocol === 'x402') return null;
      return resolveEntrypointPrice(entrypoint, which);
    },
    async authorize(
      request: Request,
      entrypoint: EntrypointDef,
      kind: 'invoke' | 'stream',
      resolvedRequirement?: MppPaymentRequirement,
      options?: { allowIdempotencyRecovery?: boolean }
    ) {
      const requirement = resolvedRequirement ?? requirements(entrypoint, kind);
      if (!requirement.required) return { authorized: true } as const;

      const available = matchingRails(requirement);
      if (available.length === 0) {
        return {
          authorized: false,
          response: configurationResponse(
            `No configured MPP method supports ${requirement.intent} for entrypoint "${entrypoint.key}".`
          ),
        } as const;
      }

      const credential = decodeMppCredential(request);
      const selected = credential
        ? available.find(
            rail =>
              rail.descriptor.name === credential.challenge.method &&
              (!rail.native ||
                rail.native.intent === credential.challenge.intent)
          )
        : available[0];

      if (!credential || !selected) {
        try {
          return {
            authorized: false,
            response: await challengeFor(
              available[0]!,
              request,
              requirement,
              entrypoint,
              kind
            ),
          } as const;
        } catch (error) {
          return {
            authorized: false,
            response: configurationResponse(
              `Failed to create MPP challenge: ${error instanceof Error ? error.message : String(error)}`
            ),
          } as const;
        }
      }

      const claim = claimChallenge(
        credential,
        entrypoint,
        kind,
        request,
        options?.allowIdempotencyRecovery === true
      );
      if (claim.state === 'cached') return claim.authorization;
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
        return {
          authorized: false,
          response: await challengeFor(
            available[0]!,
            request,
            requirement,
            entrypoint,
            kind
          ),
        } as const;
      }

      if (!selected.native) {
        if (!config.verifyCredential) {
          rejectChallenge(credential);
          return {
            authorized: false,
            response: challengeWithCustomVerifier(
              selected,
              requirement,
              entrypoint,
              kind
            ),
          } as const;
        }
        let verification: Awaited<ReturnType<typeof config.verifyCredential>>;
        try {
          verification = await config.verifyCredential({
            request,
            entrypoint,
            kind,
            requirement,
            credential,
          });
        } catch (error) {
          releaseChallengeClaim(credential);
          return {
            authorized: false,
            response: configurationResponse(
              `MPP verification failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            ),
          } as const;
        }
        if (verification.valid === false) {
          rejectChallenge(credential);
          return {
            authorized: false,
            response:
              verification.response?.clone() ??
              challengeWithCustomVerifier(
                selected,
                requirement,
                entrypoint,
                kind
              ),
          } as const;
        }
        let receipt: string;
        try {
          receipt = normalizeReceiptHeader(verification.receipt);
        } catch (error) {
          // valid:true asserts that settlement succeeded. Consume this
          // credential so an invalid receipt cannot trigger a second charge.
          rejectChallenge(credential);
          return {
            authorized: false,
            response: configurationResponse(
              `MPP verification failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            ),
          } as const;
        }
        return completeChallenge(credential, {
          authorized: true,
          receipt,
          ...(verification.payer ? { payer: verification.payer } : {}),
          ...(verification.network ? { network: verification.network } : {}),
        });
      }

      let result: NativePaymentResult;
      try {
        result = await nativeHandler(selected, requirement)(request);
      } catch (error) {
        releaseChallengeClaim(credential);
        return {
          authorized: false,
          response: configurationResponse(
            `MPP verification failed: ${error instanceof Error ? error.message : String(error)}`
          ),
        } as const;
      }
      if (result.status === 402) {
        rejectChallenge(credential);
        const challenge = Challenge.fromResponse(result.challenge);
        rememberChallenge(challenge, entrypoint, kind);
        return { authorized: false, response: result.challenge } as const;
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
        const handled = receiptResponse.headers.has(CONTENT_RESPONSE_MARKER)
          ? undefined
          : receiptResponse;
        return completeChallenge(credential, {
          authorized: true,
          receipt,
          ...(handled ? { handled } : {}),
        });
      } catch (error) {
        // status:200 means the native rail accepted the payment. Consume this
        // credential if receipt construction fails to prevent re-settlement.
        rejectChallenge(credential);
        return {
          authorized: false,
          response: configurationResponse(
            `MPP verification failed: ${error instanceof Error ? error.message : String(error)}`
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
};

/** Create the Machine Payments Protocol extension. */
export function mpp(
  options?: MppExtensionOptions
): Extension<{ mpp?: MppRuntime }> {
  let mppRuntime: MppRuntime | undefined;

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
      mppRuntime = await createMppRuntime(options.config, ctx.meta.name);
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
  };
}
