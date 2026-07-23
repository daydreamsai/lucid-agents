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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Challenge, Credential, Method, PaymentRequest, z } from 'mppx';

import { mpp } from '../extension';
import { createInMemoryMppChallengeStore } from '../in-memory-challenge-store';
import { stripe, tempo } from '../methods';
import { createSQLiteMppChallengeStore } from '../sqlite-challenge-store';

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
const nativeSecretKey = 'mpp-test-secret-key-with-32-bytes';

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

function authorizedBodyRequest(
  response: Response,
  body: string,
  url = 'https://agent.test/paid'
): Request {
  const paymentChallenge = Challenge.fromResponse(response);
  return new Request(url, {
    method: 'POST',
    headers: {
      Authorization: Credential.serialize({
        challenge: paymentChallenge,
        payload: { proof: 'test' },
        source: 'did:pkh:eip155:84532:0xpayer',
      }),
      'Content-Type': 'application/json',
    },
    body,
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

  it('rejects an undersized native challenge secret during build', async () => {
    const extension = mpp({
      config: {
        methods: [
          tempo.server({
            currency: '0x20c0000000000000000000000000000000000000',
            recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          }),
        ],
        secretKey: 'too-short',
      },
    });

    expect(extension.build(buildContext)).rejects.toThrow(
      'MPP secretKey must be at least 32 bytes'
    );
  });

  it('requires a stable secret with durable challenge storage', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-secret-'));
    const store = createSQLiteMppChallengeStore(
      join(directory, 'challenges.db')
    );
    try {
      const extension = mpp({
        config: {
          methods: [{ name: 'test', implementation: 'custom', config: {} }],
          currency: 'usd',
          challengeStore: store,
          verifyCredential: async () => ({
            valid: true,
            receipt: 'receipt',
          }),
        },
      });

      await expect(extension.build(buildContext)).rejects.toThrow(
        'durable challenge storage requires an explicit stable secretKey'
      );
    } finally {
      await store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires TLS unless development or a trusted proxy is explicit', async () => {
    const config = {
      methods: [
        { name: 'test', implementation: 'custom' as const, config: {} },
      ],
      currency: 'usd',
    };
    const secureByDefault = mpp({ config });
    const defaultSlice = await secureByDefault.build(buildContext);
    if (!defaultSlice.mpp) throw new Error('Expected MPP runtime');
    defaultSlice.mpp.activate(paidEntrypoint);

    const plaintext = await defaultSlice.mpp.authorize(
      new Request('http://agent.test/paid'),
      paidEntrypoint,
      'invoke',
      required(defaultSlice.mpp)
    );

    expect(plaintext.authorized).toBe(false);
    if (plaintext.authorized) throw new Error('Expected TLS rejection');
    expect(plaintext.response.status).toBe(400);
    expect(plaintext.response.headers.get('WWW-Authenticate')).toBeNull();
    expect(await plaintext.response.json()).toMatchObject({
      type: 'https://paymentauth.org/problems/insecure-transport',
      title: 'Secure Transport Required',
      status: 400,
    });

    const development = mpp({
      config,
      allowInsecureHttpForDevelopment: true,
    });
    const developmentSlice = await development.build(buildContext);
    if (!developmentSlice.mpp) throw new Error('Expected MPP runtime');
    developmentSlice.mpp.activate(paidEntrypoint);
    const allowed = await developmentSlice.mpp.authorize(
      new Request('http://localhost:3000/paid'),
      paidEntrypoint,
      'invoke',
      required(developmentSlice.mpp)
    );
    expect(allowed.authorized).toBe(false);
    if (allowed.authorized) throw new Error('Expected MPP challenge');
    expect(allowed.response.status).toBe(402);

    const proxied = mpp({ config, trustForwardedProto: true });
    const proxiedSlice = await proxied.build(buildContext);
    if (!proxiedSlice.mpp) throw new Error('Expected MPP runtime');
    proxiedSlice.mpp.activate(paidEntrypoint);
    const forwarded = await proxiedSlice.mpp.authorize(
      new Request('http://internal.service/paid', {
        headers: { 'X-Forwarded-Proto': 'https' },
      }),
      paidEntrypoint,
      'invoke',
      required(proxiedSlice.mpp)
    );
    expect(forwarded.authorized).toBe(false);
    if (forwarded.authorized) throw new Error('Expected MPP challenge');
    expect(forwarded.response.status).toBe(402);
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

  it('fails closed when a priced operation selects no compatible method', async () => {
    const { runtime } = await buildRuntime();
    runtime.activate(paidEntrypoint);
    const misconfigured: EntrypointDef = {
      ...paidEntrypoint,
      metadata: { mpp: { methods: ['missing'] } },
    };
    const requirement = required(runtime, misconfigured);

    expect(requirement.methods).toEqual(['missing']);
    const result = await runtime.authorize(
      new Request('https://agent.test/paid'),
      misconfigured,
      'invoke',
      requirement
    );
    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected configuration failure');
    expect(result.response.status).toBe(503);
  });

  it('emits every compatible rail and honors Accept-Payment ordering', async () => {
    const extension = mpp({
      config: {
        methods: [
          {
            name: 'tempo',
            implementation: 'custom',
            config: { currency: 'pathUSD' },
          },
          {
            name: 'stripe',
            implementation: 'custom',
            config: { currency: 'usd' },
          },
          {
            name: 'evm',
            implementation: 'custom',
            config: { currency: 'USDC' },
          },
        ],
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);
    const requirement = required(slice.mpp);

    const all = await slice.mpp.authorize(
      new Request('https://agent.test/paid'),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(all.authorized).toBe(false);
    if (all.authorized) throw new Error('Expected MPP challenge');
    expect(
      Challenge.fromResponseList(all.response).map(value => [
        value.method,
        value.request.currency,
      ])
    ).toEqual([
      ['tempo', 'pathUSD'],
      ['stripe', 'usd'],
      ['evm', 'USDC'],
    ]);

    const preferred = await slice.mpp.authorize(
      new Request('https://agent.test/paid', {
        headers: {
          'Accept-Payment': 'stripe/charge;q=0.8, evm/charge, tempo/charge;q=0',
        },
      }),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(preferred.authorized).toBe(false);
    if (preferred.authorized) throw new Error('Expected MPP challenge');
    expect(
      Challenge.fromResponseList(preferred.response).map(value => value.method)
    ).toEqual(['evm', 'stripe']);
  });

  it('dispatches the selected challenge without downgrading on retry preferences', async () => {
    let verifiedMethod: string | undefined;
    const extension = mpp({
      config: {
        methods: [
          { name: 'tempo', implementation: 'custom', config: {} },
          { name: 'stripe', implementation: 'custom', config: {} },
          { name: 'evm', implementation: 'custom', config: {} },
        ],
        verifyCredential: async context => {
          verifiedMethod = context.credential.challenge.method;
          return { valid: true, receipt: 'stripe-receipt' };
        },
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);
    const requirement = required(slice.mpp);
    const offered = await slice.mpp.authorize(
      new Request('https://agent.test/paid'),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(offered.authorized).toBe(false);
    if (offered.authorized) throw new Error('Expected MPP challenge');
    const stripeChallenge = Challenge.fromResponseList(offered.response).find(
      value => value.method === 'stripe'
    );
    if (!stripeChallenge) throw new Error('Expected Stripe challenge');

    const result = await slice.mpp.authorize(
      new Request('https://agent.test/paid', {
        headers: {
          'Accept-Payment': 'evm/charge, stripe/charge;q=0',
          Authorization: Credential.serialize({
            challenge: stripeChallenge,
            payload: { proof: 'paid' },
          }),
        },
      }),
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(result.authorized).toBe(true);
    expect(result.authorized && result.payment).toEqual({
      amount: '1',
      currency: 'usd',
      intent: 'charge',
      method: 'stripe',
    });
    expect(verifiedMethod).toBe('stripe');
  });

  it('recovers the selected multi-method terms for idempotent accounting', async () => {
    let verifierCalls = 0;
    const extension = mpp({
      config: {
        methods: [
          {
            name: 'tempo',
            implementation: 'custom',
            config: { currency: 'pathUSD' },
          },
          {
            name: 'stripe',
            implementation: 'custom',
            config: { currency: 'usd' },
          },
        ],
        verifyCredential: async () => {
          verifierCalls += 1;
          return { valid: true, receipt: 'multi-method-receipt' };
        },
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);
    const requirement = required(slice.mpp);
    const offered = await slice.mpp.authorize(
      new Request('https://agent.test/paid'),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(offered.authorized).toBe(false);
    if (offered.authorized) throw new Error('Expected MPP challenge');
    const stripeChallenge = Challenge.fromResponseList(offered.response).find(
      value => value.method === 'stripe'
    );
    if (!stripeChallenge) throw new Error('Expected Stripe challenge');
    const request = new Request('https://agent.test/paid', {
      headers: {
        Authorization: Credential.serialize({
          challenge: stripeChallenge,
          payload: { proof: 'paid' },
        }),
        'Idempotency-Key': 'multi-method-recovery-0001',
      },
    });

    const accepted = await slice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );
    const recovered = await slice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );

    expect(accepted).toMatchObject({
      authorized: true,
      receipt: 'multi-method-receipt',
      payment: {
        amount: '1',
        currency: 'usd',
        intent: 'charge',
        method: 'stripe',
      },
    });
    expect(recovered).toEqual(accepted);
    expect(verifierCalls).toBe(1);
  });

  it('rejects ambiguous duplicate method names during build', async () => {
    const extension = mpp({
      config: {
        methods: [
          { name: 'same', implementation: 'custom', config: {} },
          { name: 'same', implementation: 'custom', config: {} },
        ],
      },
    });

    expect(extension.build(buildContext)).rejects.toThrow(
      'MPP methods must be unique by name and implementation'
    );
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

    const verified = await buildRuntime(async () => ({
      valid: true,
      receipt: 'unused-receipt',
    }));
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

  it('returns a fresh malformed-credential problem for invalid Payment syntax', async () => {
    const { runtime } = await buildRuntime();
    runtime.activate(paidEntrypoint);

    const malformed = await runtime.authorize(
      new Request('https://agent.test/paid', {
        headers: { Authorization: 'Payment not-base64url' },
      }),
      paidEntrypoint,
      'invoke',
      required(runtime)
    );

    expect(malformed.authorized).toBe(false);
    if (malformed.authorized) throw new Error('Expected rejection');
    expect(malformed.response.status).toBe(402);
    expect(malformed.response.headers.get('Cache-Control')).toBe('no-store');
    expect(malformed.response.headers.get('WWW-Authenticate')).toStartWith(
      'Payment '
    );
    expect(await malformed.response.json()).toMatchObject({
      type: 'https://paymentauth.org/problems/malformed-credential',
      title: 'Malformed Credential',
      status: 402,
    });
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
    const { runtime } = await buildRuntime(async () => ({
      valid: true,
      receipt: 'identity-test-receipt',
    }));
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
      receipt: 'identity-test-receipt',
    });
  });

  it('fails closed and consumes a settled credential when a custom verifier omits its receipt', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return verifierCalls === 1
        ? { valid: true, receipt: '' }
        : { valid: true, receipt: 'recovered-custom-receipt' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(await challenge(runtime, requirement));

    const missingReceipt = await runtime.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(missingReceipt.authorized).toBe(false);
    if (missingReceipt.authorized) throw new Error('Expected rejection');
    expect(missingReceipt.response.status).toBe(503);
    expect(await missingReceipt.response.text()).toContain(
      'MPP payment receipt processing failed.'
    );

    const replayed = await runtime.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(replayed.authorized).toBe(false);
    if (replayed.authorized) throw new Error('Expected a fresh challenge');
    expect(replayed.response.status).toBe(402);
    expect(verifierCalls).toBe(1);

    const recovered = await runtime.authorize(
      authorizedRequest(replayed.response),
      paidEntrypoint,
      'invoke',
      requirement
    );
    expect(recovered).toEqual({
      authorized: true,
      receipt: 'recovered-custom-receipt',
    });
    expect(verifierCalls).toBe(2);
  });

  it('rejects unsafe and oversized custom receipt headers before authorization', async () => {
    for (const unsafeReceipt of [
      'bad\r\nInjected: yes',
      'x'.repeat(8 * 1024 + 1),
      ' padded-receipt ',
    ]) {
      let verifierCalls = 0;
      const { runtime } = await buildRuntime(async () => {
        verifierCalls += 1;
        return verifierCalls === 1
          ? { valid: true, receipt: unsafeReceipt }
          : { valid: true, receipt: 'safe-retry-receipt' };
      });
      runtime.activate(paidEntrypoint);
      const requirement = required(runtime);
      const request = authorizedRequest(await challenge(runtime, requirement));

      const rejected = await runtime.authorize(
        new Request(request),
        paidEntrypoint,
        'invoke',
        requirement
      );
      expect(rejected.authorized).toBe(false);
      if (rejected.authorized) throw new Error('Expected rejection');
      expect(rejected.response.status).toBe(503);
      expect(await rejected.response.text()).toContain(
        'MPP payment receipt processing failed.'
      );

      const replayed = await runtime.authorize(
        new Request(request),
        paidEntrypoint,
        'invoke',
        requirement
      );
      expect(replayed.authorized).toBe(false);
      if (replayed.authorized) throw new Error('Expected a fresh challenge');
      expect(replayed.response.status).toBe(402);
      expect(verifierCalls).toBe(1);

      expect(
        await runtime.authorize(
          authorizedRequest(replayed.response),
          paidEntrypoint,
          'invoke',
          requirement
        )
      ).toEqual({
        authorized: true,
        receipt: 'safe-retry-receipt',
      });
      expect(verifierCalls).toBe(2);
    }
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

  it('recovers a verified receipt across runtimes sharing a challenge store', async () => {
    let verifierCalls = 0;
    const challengeStore = createInMemoryMppChallengeStore();
    const config = {
      methods: [
        { name: 'test', implementation: 'custom' as const, config: {} },
      ],
      currency: 'usd',
      secretKey: 'durable-runtime-secret-key-00000001',
      challengeStore,
      verifyCredential: async () => {
        verifierCalls += 1;
        return {
          valid: true as const,
          receipt: 'durable-receipt',
          payer: 'did:example:payer',
          network: 'eip155:1',
        };
      },
    };
    const firstExtension = mpp({ config });
    const firstSlice = await firstExtension.build(buildContext);
    const secondExtension = mpp({ config });
    const secondSlice = await secondExtension.build(buildContext);
    if (!firstSlice.mpp || !secondSlice.mpp) {
      throw new Error('Expected MPP runtimes');
    }
    firstSlice.mpp.activate(paidEntrypoint);
    secondSlice.mpp.activate(paidEntrypoint);
    const requirement = required(firstSlice.mpp);
    const request = authorizedRequest(
      await challenge(firstSlice.mpp, requirement),
      { proof: 'test' },
      'durable-recovery-key-0001'
    );

    const accepted = await firstSlice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );
    const recovered = await secondSlice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement,
      { allowIdempotencyRecovery: true }
    );

    expect(accepted).toEqual({
      authorized: true,
      receipt: 'durable-receipt',
      payer: 'did:example:payer',
      network: 'eip155:1',
    });
    expect(recovered).toEqual(accepted);
    expect(verifierCalls).toBe(1);
    await challengeStore.close();
  });

  it('runs selected payment policy preflight before invoking a settlement verifier', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return { valid: true, receipt: 'must-not-settle' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const request = authorizedRequest(await challenge(runtime, requirement));
    const checked: unknown[] = [];

    const denied = await runtime.authorize(
      request,
      paidEntrypoint,
      'invoke',
      requirement,
      {
        preflightPayment: async payment => {
          checked.push(payment);
          return Response.json(
            { error: { code: 'policy_violation' } },
            { status: 403 }
          );
        },
      }
    );

    expect(denied.authorized).toBe(false);
    if (denied.authorized) throw new Error('Expected policy rejection');
    expect(denied.response.status).toBe(403);
    expect(checked).toEqual([
      {
        amount: '1',
        currency: 'usd',
        intent: 'charge',
        method: 'test',
      },
    ]);
    expect(verifierCalls).toBe(0);
  });

  it('renews the verification lease while a slow verifier is running', async () => {
    let verifierCalls = 0;
    let finishVerification: (() => void) | undefined;
    const verifierGate = new Promise<void>(resolve => {
      finishVerification = resolve;
    });
    const challengeStore = createInMemoryMppChallengeStore({ leaseMs: 30 });
    const extension = mpp({
      config: {
        methods: [
          { name: 'test', implementation: 'custom' as const, config: {} },
        ],
        currency: 'usd',
        challengeStore,
        verifyCredential: async () => {
          verifierCalls += 1;
          await verifierGate;
          return { valid: true as const, receipt: 'slow-receipt' };
        },
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);
    const requirement = required(slice.mpp);
    const request = authorizedRequest(await challenge(slice.mpp, requirement));

    const first = slice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );
    await new Promise(resolve => setTimeout(resolve, 70));
    const concurrent = await slice.mpp.authorize(
      new Request(request),
      paidEntrypoint,
      'invoke',
      requirement
    );
    finishVerification?.();
    const accepted = await first;

    expect(concurrent.authorized).toBe(false);
    if (concurrent.authorized) throw new Error('Expected verification fence');
    expect(concurrent.response.status).toBe(409);
    expect(accepted).toMatchObject({
      authorized: true,
      receipt: 'slow-receipt',
    });
    expect(verifierCalls).toBe(1);
    await challengeStore.close();
  });

  it('recovers an idempotent receipt after a durable runtime restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lucid-mpp-runtime-'));
    const dbPath = join(directory, 'challenges.db');
    let verifierCalls = 0;
    const createConfig = (
      challengeStore: ReturnType<typeof createSQLiteMppChallengeStore>
    ) => ({
      methods: [
        { name: 'test', implementation: 'custom' as const, config: {} },
      ],
      currency: 'usd',
      secretKey: 'restart-durable-secret-key-0000001',
      challengeStore,
      verifyCredential: async () => {
        verifierCalls += 1;
        return { valid: true as const, receipt: 'restart-receipt' };
      },
    });

    try {
      const firstStore = createSQLiteMppChallengeStore(dbPath, {
        namespace: 'runtime-restart',
      });
      const firstExtension = mpp({ config: createConfig(firstStore) });
      const firstSlice = await firstExtension.build(buildContext);
      if (!firstSlice.mpp) throw new Error('Expected MPP runtime');
      firstSlice.mpp.activate(paidEntrypoint);
      const requirement = required(firstSlice.mpp);
      const request = authorizedRequest(
        await challenge(firstSlice.mpp, requirement),
        { proof: 'test' },
        'restart-recovery-key-0001'
      );
      const accepted = await firstSlice.mpp.authorize(
        new Request(request),
        paidEntrypoint,
        'invoke',
        requirement,
        { allowIdempotencyRecovery: true }
      );
      await firstStore.close();

      const secondStore = createSQLiteMppChallengeStore(dbPath, {
        namespace: 'runtime-restart',
      });
      const secondExtension = mpp({ config: createConfig(secondStore) });
      const secondSlice = await secondExtension.build(buildContext);
      if (!secondSlice.mpp) throw new Error('Expected MPP runtime');
      secondSlice.mpp.activate(paidEntrypoint);
      const recovered = await secondSlice.mpp.authorize(
        new Request(request),
        paidEntrypoint,
        'invoke',
        requirement,
        { allowIdempotencyRecovery: true }
      );

      expect(accepted).toEqual({
        authorized: true,
        receipt: 'restart-receipt',
      });
      expect(recovered).toEqual(accepted);
      expect(verifierCalls).toBe(1);
      await secondStore.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fences concurrent verification attempts', async () => {
    let release: (() => void) | undefined;
    const verifying = new Promise<void>(resolve => {
      release = resolve;
    });
    const { runtime } = await buildRuntime(async () => {
      await verifying;
      return { valid: true, receipt: 'concurrent-receipt' };
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
    const { runtime } = await buildRuntime(async () => ({
      valid: true,
      receipt: 'bound-receipt',
    }));
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

  it('binds credentials to the challenged HTTP method and route', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return { valid: true, receipt: 'must-not-settle' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const challenged = await runtime.authorize(
      new Request('https://agent.test/paid?format=json'),
      paidEntrypoint,
      'invoke',
      requirement
    );
    if (challenged.authorized) throw new Error('Expected MPP challenge');
    const paymentChallenge = Challenge.fromResponse(challenged.response);
    const credential = Credential.serialize({
      challenge: paymentChallenge,
      payload: { proof: 'test' },
    });

    const wrongRoute = await runtime.authorize(
      new Request('https://agent.test/other?format=json', {
        headers: { Authorization: credential },
      }),
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(wrongRoute.authorized).toBe(false);
    if (wrongRoute.authorized) throw new Error('Expected target mismatch');
    expect(await wrongRoute.response.json()).toMatchObject({
      type: 'https://paymentauth.org/problems/invalid-challenge',
      status: 402,
    });
    expect(verifierCalls).toBe(0);
  });

  it('binds POST challenges to the request body without consuming it', async () => {
    const { runtime } = await buildRuntime(async () => ({
      valid: true,
      receipt: 'body-bound-receipt',
    }));
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const body = '{"query":"one"}';
    const request = new Request('https://agent.test/paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const result = await runtime.authorize(
      request,
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(result.authorized).toBe(false);
    if (result.authorized) throw new Error('Expected MPP challenge');
    const paymentChallenge = Challenge.fromResponse(result.response);
    expect(paymentChallenge.digest).toBe(
      'sha-256=:KsutN/tMchgTwmXhXEVpfIyJczmi8pMZaxhw9zwBqLc=:'
    );
    expect(await request.text()).toBe(body);
  });

  it('rejects a credential replayed with a different request body', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      return { valid: true, receipt: 'must-not-settle' };
    });
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const challengeRequest = new Request('https://agent.test/paid', {
      method: 'POST',
      body: '{"query":"one"}',
    });
    const challenged = await runtime.authorize(
      challengeRequest,
      paidEntrypoint,
      'invoke',
      requirement
    );
    if (challenged.authorized) throw new Error('Expected MPP challenge');

    const rejected = await runtime.authorize(
      authorizedBodyRequest(challenged.response, '{"query":"two"}'),
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(rejected.authorized).toBe(false);
    if (rejected.authorized) throw new Error('Expected body mismatch');
    expect(rejected.response.status).toBe(402);
    expect(rejected.response.headers.get('Cache-Control')).toBe('no-store');
    expect(rejected.response.headers.get('WWW-Authenticate')).toStartWith(
      'Payment '
    );
    expect(await rejected.response.json()).toMatchObject({
      type: 'https://paymentauth.org/problems/verification-failed',
      title: 'Verification Failed',
      status: 402,
    });
    expect(verifierCalls).toBe(0);
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

  it('returns a fresh verification-failed problem when proof verification fails', async () => {
    const { runtime } = await buildRuntime(async () => ({
      valid: false,
      reason: 'invalid proof',
    }));
    runtime.activate(paidEntrypoint);
    const requirement = required(runtime);
    const paymentChallenge = await challenge(runtime, requirement);

    const rejected = await runtime.authorize(
      authorizedRequest(paymentChallenge),
      paidEntrypoint,
      'invoke',
      requirement
    );

    expect(rejected.authorized).toBe(false);
    if (rejected.authorized) throw new Error('Expected verifier rejection');
    expect(rejected.response.status).toBe(402);
    expect(rejected.response.headers.get('WWW-Authenticate')).toStartWith(
      'Payment '
    );
    expect(await rejected.response.json()).toMatchObject({
      type: 'https://paymentauth.org/problems/verification-failed',
      title: 'Verification Failed',
      status: 402,
      detail: 'Payment verification failed: invalid proof.',
    });
  });

  it('consumes ambiguous verifier exceptions and does not expose secrets', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async () => {
      verifierCalls += 1;
      if (verifierCalls === 1) throw new Error('sk_live_verifier-secret');
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
    expect(await unavailable.response.json()).toEqual({
      error: {
        code: 'mpp_configuration_error',
        message: 'MPP payment verification is temporarily unavailable.',
      },
    });
    expect(recovered.authorized).toBe(false);
    if (recovered.authorized) throw new Error('Expected consumed credential');
    expect(recovered.response.status).toBe(402);
    expect(verifierCalls).toBe(1);
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
        secretKey: nativeSecretKey,
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
        secretKey: nativeSecretKey,
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

  it('binds native charge challenges to POST bodies and routes', async () => {
    const extension = mpp({
      config: {
        methods: [
          stripe.server({
            secretKey: 'sk_test',
            networkId: 'profile_test',
            currency: 'usd',
          }),
        ],
        secretKey: nativeSecretKey,
      },
    });
    const slice = await extension.build(buildContext);
    if (!slice.mpp) throw new Error('Expected MPP runtime');
    slice.mpp.activate(paidEntrypoint);
    const request = new Request('https://agent.test/paid?format=json', {
      method: 'POST',
      body: '{"query":"one"}',
    });

    const challenged = await slice.mpp.authorize(
      request,
      paidEntrypoint,
      'invoke',
      required(slice.mpp)
    );

    expect(challenged.authorized).toBe(false);
    if (challenged.authorized) throw new Error('Expected MPP challenge');
    const paymentChallenge = Challenge.fromResponse(challenged.response);
    expect(paymentChallenge.digest).toBe(
      'sha-256=:KsutN/tMchgTwmXhXEVpfIyJczmi8pMZaxhw9zwBqLc=:'
    );
    expect(
      PaymentRequest.deserialize(paymentChallenge.opaque ?? '')._mppx_scope
    ).toBe(
      '["paid","invoke","POST","/paid?format=json","sha-256=:KsutN/tMchgTwmXhXEVpfIyJczmi8pMZaxhw9zwBqLc=:"]'
    );
    expect(await request.text()).toBe('{"query":"one"}');
  });

  it('completes a standard mppx client-to-runtime payment round trip', async () => {
    let verifierCalls = 0;
    const { runtime } = await buildRuntime(async ({ credential }) => {
      verifierCalls += 1;
      return credential.payload.proof === 'client-proof'
        ? { valid: true, receipt: 'client-round-trip-receipt' }
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
    expect(manifest?.payments).toHaveLength(3);
    expect(manifest?.payments?.[0]).toEqual({ method: 'x402' });
    expect(manifest?.payments?.slice(1)).toMatchObject([
      {
        method: 'mpp',
        priceModel: { default: '1' },
        extensions: { mpp: { amount: '1', intent: 'charge' } },
      },
      {
        method: 'mpp',
        priceModel: { default: '2' },
        extensions: { mpp: { amount: '2', intent: 'charge' } },
      },
    ]);
  });
});
