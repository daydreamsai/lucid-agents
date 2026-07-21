import type {
  AgentManifest,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
} from '@lucid-agents/types/core';
import type { FetchFunction } from '@lucid-agents/types/http';
import type {
  MppCredentialVerifier,
  MppPaymentRequirement,
  MppRuntime,
} from '@lucid-agents/types/mpp';
import { describe, expect, it } from 'bun:test';
import { Challenge, Credential, Method, z } from 'mppx';

import { mpp } from '../extension';
import { stripe, tempo } from '../methods';

const paidEntrypoint: EntrypointDef = {
  key: 'paid',
  description: 'Paid operation',
  price: { invoke: '1', stream: '2' },
  stream: async () => ({ status: 'succeeded' }),
};

const buildContext = {
  meta: { name: 'mpp-test', version: '1.0.0' },
  runtime: {},
} as BuildContext;

async function buildRuntime(verifyCredential?: MppCredentialVerifier): Promise<{
  extension: ReturnType<typeof mpp>;
  runtime: MppRuntime;
}> {
  const extension = mpp({
    config: {
      methods: [{ name: 'test', implementation: 'custom', config: {} }],
      currency: 'usd',
      verifyCredential,
    },
  });
  const slice = await extension.build(buildContext);
  if (!slice.mpp) throw new Error('Expected MPP runtime');
  return { extension, runtime: slice.mpp };
}

function required(
  runtime: MppRuntime,
  entrypoint: EntrypointDef = paidEntrypoint,
  kind: 'invoke' | 'stream' = 'invoke'
): Extract<MppPaymentRequirement, { required: true }> {
  const requirement = runtime.requirements(entrypoint, kind);
  if (!requirement.required) throw new Error('Expected MPP requirement');
  return requirement;
}

async function challenge(
  runtime: MppRuntime,
  requirement: Extract<MppPaymentRequirement, { required: true }>,
  entrypoint: EntrypointDef = paidEntrypoint,
  kind: 'invoke' | 'stream' = 'invoke'
): Promise<Response> {
  const result = await runtime.authorize(
    new Request('https://agent.test/paid'),
    entrypoint,
    kind,
    requirement
  );
  if (result.authorized) throw new Error('Expected MPP challenge');
  expect(result.response.status).toBe(402);
  return result.response;
}

function authorizedRequest(
  response: Response,
  payload: Record<string, unknown> = { proof: 'test' },
  idempotencyKey?: string
): Request {
  const paymentChallenge = Challenge.fromResponse(response);
  return new Request('https://agent.test/paid', {
    headers: {
      Authorization: Credential.serialize({
        challenge: paymentChallenge,
        payload,
        source: 'did:pkh:eip155:84532:0xpayer',
      }),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  });
}

async function expectNativeCredentialRejection(
  runtime: MppRuntime,
  requirement: Extract<MppPaymentRequirement, { required: true }>,
  response: Response
): Promise<void> {
  const verification = await runtime.authorize(
    authorizedRequest(response, {}),
    paidEntrypoint,
    'invoke',
    requirement
  );
  expect(verification.authorized).toBe(false);
  if (verification.authorized) throw new Error('Expected native rejection');
  expect(verification.response.status).toBe(402);
}

describe('mpp extension configuration', () => {
  it('fails closed when installed without configuration', async () => {
    const extension = mpp();

    expect(() => extension.build({} as BuildContext)).toThrow(
      'mpp() requires a config'
    );
  });

  it('can be explicitly disabled', async () => {
    const extension = mpp({ config: false });

    expect(await extension.build({} as BuildContext)).toEqual({});
  });

  it('activates only for MPP-priced entrypoints and resolves kind-specific requirements', async () => {
    const { extension, runtime } = await buildRuntime();

    expect(runtime.isActive).toBe(false);
    expect(runtime.requirements(paidEntrypoint, 'invoke')).toEqual({
      required: false,
    });
    extension.onEntrypointAdded?.(
      { ...paidEntrypoint, paymentProtocol: 'x402' },
      {} as AgentRuntime
    );
    expect(runtime.isActive).toBe(false);

    extension.onEntrypointAdded?.(paidEntrypoint, {} as AgentRuntime);
    expect(runtime.isActive).toBe(true);
    expect(runtime.resolvePrice(paidEntrypoint, 'invoke')).toBe('1');
    expect(runtime.resolvePrice(paidEntrypoint, 'stream')).toBe('2');
    expect(
      runtime.resolvePrice(
        { ...paidEntrypoint, paymentProtocol: 'x402' },
        'invoke'
      )
    ).toBeNull();

    expect(required(runtime, paidEntrypoint, 'stream')).toMatchObject({
      amount: '2',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
    });
  });

  it('honors entrypoint-level MPP challenge overrides', async () => {
    const { runtime } = await buildRuntime();
    runtime.activate(paidEntrypoint);

    const entrypoint: EntrypointDef = {
      ...paidEntrypoint,
      metadata: {
        mpp: {
          amount: '3',
          currency: 'eur',
          intent: 'session',
          methods: ['test'],
          description: 'Per-entrypoint terms',
        },
      },
    };

    expect(required(runtime, entrypoint)).toMatchObject({
      amount: '3',
      currency: 'eur',
      intent: 'session',
      methods: ['test'],
      description: 'Per-entrypoint terms',
    });
  });

  it('fails closed without a verifier or a valid standard credential', async () => {
    const { runtime } = await buildRuntime();
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const firstChallenge = await challenge(runtime, requirement);

    const missingVerifier = await runtime.authorize(
      authorizedRequest(firstChallenge),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(missingVerifier.authorized).toBe(false);
    if (missingVerifier.authorized) throw new Error('Expected rejection');
    expect(missingVerifier.response.status).toBe(402);

    const verified = await buildRuntime(async () => ({ valid: true }));
    verified.runtime.activate(paidEntrypoint);
    const malformed = await verified.runtime.authorize(
      new Request('https://agent.test/paid', {
        headers: { Authorization: 'Payment not-base64url' },
      }),
      paidEntrypoint,
      'invoke',
      required(verified.runtime)
    );
    expect(malformed.authorized).toBe(false);
  });

  it('returns verified identity metadata and consumes a challenge exactly once', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async ({ credential }) => {
      verifierCalls += 1;
      return credential.payload.proof === 'test'
        ? {
            valid: true,
            receipt: 'receipt-1',
            payer: '0xverified',
            network: 'eip155:84532',
          }
        : { valid: false };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(await challenge(runtime, requirement));

    const accepted = await runtime.authorize(
      request,
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(accepted).toEqual({
      authorized: true,
      receipt: 'receipt-1',
      payer: '0xverified',
      network: 'eip155:84532',
    });

    const replay = await runtime.authorize(
      request,
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(replay.authorized).toBe(false);
    expect(verifierCalls).toBe(1);
  });

  it('does not treat the credential source as verifier-attested identity', async () => {
    const { runtime } = await buildRuntime(async () => ({ valid: true }));
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(await challenge(runtime, requirement));

    const accepted = await runtime.authorize(
      request,
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(accepted).toEqual({ authorized: true });
  });

  it('does not enable payment replay from an idempotency header alone', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return { valid: true, receipt: 'single-use-receipt' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime, paidEntrypoint, 'stream');
    const request = authorizedRequest(
      await challenge(runtime, requirement, paidEntrypoint, 'stream'),
      { proof: 'test' },
      'stream-replay-payment-0001'
    );

    const accepted = await runtime.authorize(
      request,
      paidEntrypoint,
      'stream',
      requirement
    );
    const replay = await runtime.authorize(
      new Request(request),
      paidEntrypoint,
      'stream',
      requirement
    );

    expect(accepted.authorized).toBe(true);
    expect(replay.authorized).toBe(false);
    expect(verifierCalls).toBe(1);
  });

  it('caches successful verification only for the same idempotency key', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return { valid: true, receipt: 'stable-receipt' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const paymentChallenge = await challenge(runtime, requirement);
    const first = authorizedRequest(
      paymentChallenge,
      { proof: 'test' },
      'recover-payment-0001'
    );
    const retry = new Request(first);

    const accepted = await runtime.authorize(
      first,
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );
    const recovered = await runtime.authorize(
      retry,
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );
    const otherKey = await runtime.authorize(
      new Request(retry, {
        headers: {
          ...Object.fromEntries(retry.headers),
          'Idempotency-Key': 'different-key',
        },
      }),
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );

    expect(accepted).toMatchObject({
      authorized: true,
      receipt: 'stable-receipt',
    });
    expect(recovered).toEqual(accepted);
    expect(otherKey.authorized).toBe(false);
    expect(verifierCalls).toBe(1);
  });

  it('fences concurrent verification attempts', async () => {
    let release: (() => void) | undefined;
    const verifying = new Promise<void>(resolve => {
      release = resolve;
    });
    const { runtime } = await buildRuntime(async () => {
      await verifying;
      return { valid: true };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const paymentChallenge = await challenge(runtime, requirement);
    const first = authorizedRequest(paymentChallenge);
    const pending = runtime.authorize(
      first,
      paidEntrypoint,
      'invoke',
      requirement
    );

    const concurrent = await runtime.authorize(
      new Request(first),
      paidEntrypoint,
      'invoke',
      requirement
    );
    if (concurrent.authorized) throw new Error('Expected replay fence');
    expect(concurrent.response.status).toBe(409);

    release?.();
    expect((await pending).authorized).toBe(true);
  });

  it('binds credentials to the challenged entrypoint and mode', async () => {
    const { runtime } = await buildRuntime(async () => ({ valid: true }));
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(await challenge(runtime, requirement));

    const wrongTarget = await runtime.authorize(
      request,
      { ...paidEntrypoint, key: 'other' },
      'invoke',
      requirement
    );

    expect(wrongTarget.authorized).toBe(false);
  });

  it('contains verifier rejection and exceptions', async () => {
    for (const verifier of [
      async () => ({
        valid: false as const,
        response: Response.json({ error: 'invalid proof' }, { status: 401 }),
      }),
      async () => {
        throw new Error('verifier unavailable');
      },
    ]) {
      const { runtime } = await buildRuntime(verifier);
      runtime.activate(paidEntrypoint);
      const requirement = required(runtime);
      const response = await runtime.authorize(
        authorizedRequest(await challenge(runtime, requirement)),
        paidEntrypoint,
        'invoke',
        requirement
      );

      expect(response.authorized).toBe(false);
    }
  });

  it('allows the same credential to retry after a transient verifier exception', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      if (verifierCalls === 1) throw new Error('verifier unavailable');
      return { valid: true, receipt: 'recovered-receipt' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(
      await challenge(runtime, requirement),
      { proof: 'test' },
      'recover-verifier-0001'
    );

    const unavailable = await runtime.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );
    const recovered = await runtime.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(unavailable.authorized).toBe(false);
    if (unavailable.authorized) throw new Error('Expected verifier failure');
    expect(unavailable.response.status).toBe(503);
    expect(recovered).toMatchObject({
      authorized: true,
      receipt: 'recovered-receipt',
    });
    expect(verifierCalls).toBe(2);
  });

  it('emits native Stripe challenges and rejects invalid credentials', async () => {
    const extension = mpp({
      config: {
        methods: [
          stripe.server({
            secretKey: 'sk_test',
            networkId: 'profile_test',
            currency: 'usd',
          }),
        ],
        secretKey: 'challenge-secret',
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);

    const requirement = required(slice.mpp);
    const response = await challenge(slice.mpp, requirement);
    const paymentChallenge = Challenge.fromResponse(response);

    expect(paymentChallenge.method).toBe('stripe');
    expect(paymentChallenge.request.amount).toBe('100');
    expect(paymentChallenge.request.methodDetails).toMatchObject({
      networkId: 'profile_test',
      paymentMethodTypes: ['card'],
    });
    await expectNativeCredentialRejection(slice.mpp, requirement, response);
  });

  it('handles native Tempo charge without initializing a session rail', async () => {
    const extension = mpp({
      config: {
        methods: [
          tempo.server({
            currency: '0x20c0000000000000000000000000000000000000',
            recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          }),
        ],
        currency: 'usd',
        defaultIntent: 'charge',
        secretKey: 'challenge-secret',
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);

    const requirement = required(slice.mpp);
    const response = await challenge(slice.mpp, requirement);
    const paymentChallenge = Challenge.fromResponse(response);

    expect(paymentChallenge.method).toBe('tempo');
    expect(paymentChallenge.intent).toBe('charge');
    await expectNativeCredentialRejection(slice.mpp, requirement, response);
  });

  it('completes a standard mppx client-to-runtime payment round trip', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async ({ credential }) => {
      verifierCalls += 1;
      return credential.payload.proof === 'client-proof'
        ? { valid: true }
        : { valid: false };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const method = Method.from({
      name: 'test',
      intent: 'charge',
      schema: {
        credential: { payload: z.object({ proof: z.string() }) },
        request: z.object({
          amount: z.string(),
          currency: z.string(),
          expires: z.optional(z.string()),
        }),
      },
    });
    const clientMethod = Method.toClient(method, {
      async createCredential({ challenge: paymentChallenge }) {
        return Credential.serialize({
          challenge: paymentChallenge,
          payload: { proof: 'client-proof' },
        });
      },
    });
    let fetchCalls = 0;
    const transport: FetchFunction = async (input, init) => {
      fetchCalls += 1;
      const authorization = await runtime.authorize(
        new Request(input, init),
        paidEntrypoint,
        'invoke',
        requirement
      );
      return authorization.authorized
        ? Response.json({ paid: true })
        : authorization.response;
    };
    const paymentFetch = await runtime.getMppFetch({
      methods: [clientMethod],
      fetch: transport,
    });
    if (!paymentFetch) throw new Error('Expected MPP Fetch wrapper');

    const response = await paymentFetch('https://agent.test/paid');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paid: true });
    expect(fetchCalls).toBe(2);
    expect(verifierCalls).toBe(1);
  });

  it('does not replace global fetch and rejects an empty client method set', async () => {
    const { tempo } = await import('mppx/client');
    const { runtime } = await buildRuntime();
    const originalFetch = globalThis.fetch;

    expect(await runtime.getMppFetch({ methods: [] })).toBeNull();
    const paymentFetch = await runtime.getMppFetch({ methods: [tempo()] });

    expect(typeof paymentFetch).toBe('function');
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('adds MPP metadata without replacing existing manifest payments', async () => {
    const { extension } = await buildRuntime();
    const card: AgentManifest = {
      name: 'mpp-test',
      entrypoints: {
        paid: { description: 'Paid operation', streaming: true },
      },
      payments: [{ method: 'x402' }],
    };
    const runtime = {
      entrypoints: { snapshot: () => [paidEntrypoint] },
    } as unknown as AgentRuntime;

    const manifest = extension.onManifestBuild?.(card, runtime);

    expect(manifest?.entrypoints.paid?.pricing).toEqual({
      invoke: '1',
      stream: '2',
    });
    expect(manifest?.payments).toHaveLength(2);
    expect(manifest?.payments?.[0]).toEqual({ method: 'x402' });
  });
});
