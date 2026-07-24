import type { BuildContext, EntrypointDef } from '@lucid-agents/types/core';
import { expect, test } from 'bun:test';
import { Challenge, Credential } from 'mppx';
import * as Tempo from 'mppx/tempo';
import { createClient, custom, defineChain, zeroAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { mpp } from '../extension';
import { tempo } from '../methods';
import { createInMemoryTempoSessionStore } from '../tempo-session-store';

const payer = privateKeyToAccount(
  '0xac0974bec39a17e36ba6a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
const payee = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f094538a009d74290f5811cfba6a6b4d238ff944'
);
const chainId = 42431;
const token = '0x0000000000000000000000000000000000000003' as const;
const chain = defineChain({
  id: chainId,
  name: 'Tempo Test',
  nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost'] } },
});
const payerClient = createClient({
  account: payer,
  chain,
  transport: custom({
    async request() {
      throw new Error('unexpected payer RPC request');
    },
  }),
});
const serverClient = createClient({
  account: payee,
  chain,
  transport: custom({
    async request() {
      throw new Error('unexpected server RPC request');
    },
  }),
});

async function buildTaskSessionRuntime(includeCustomSession = false) {
  const extension = mpp({
    config: {
      methods: [
        tempo.session({
          mode: 'development',
          account: payee,
          chainId,
          currency: token,
          recipient: payee.address,
          decimals: 0,
          amount: '1',
          unitType: 'chunk',
          deposit: { minimum: '1', suggested: '2', maximum: '3' },
          store: createInMemoryTempoSessionStore(),
          getClient: () => serverClient,
        }),
        ...(includeCustomSession
          ? [
              {
                name: 'custom-session',
                implementation: 'custom' as const,
                config: {},
              },
            ]
          : []),
      ],
      defaultIntent: 'session',
      secretKey: 'tempo-session-task-test-secret-32-bytes',
    },
  });
  const slice = await extension.build({
    meta: { name: 'session-task-test', version: '1.0.0' },
    runtime: {},
  } as BuildContext);
  if (!slice.mpp) throw new Error('expected MPP runtime');
  return slice.mpp;
}

test('native Tempo sessions are unsupported for task requirements', async () => {
  const runtime = await buildTaskSessionRuntime();
  const entrypoint: EntrypointDef = {
    key: 'native-session-task',
    price: '1',
    metadata: {
      mpp: {
        intent: 'session',
        methods: ['tempo'],
      },
    },
  };
  runtime.activate(entrypoint);

  expect(() => runtime.requirements(entrypoint, 'task')).toThrow(
    'No configured MPP method supports session tasks'
  );
});

test('task requirements retain custom sessions while excluding native Tempo sessions', async () => {
  const runtime = await buildTaskSessionRuntime(true);
  const entrypoint: EntrypointDef = {
    key: 'mixed-session-task',
    price: '1',
    metadata: {
      mpp: {
        intent: 'session',
        methods: ['tempo', 'custom-session'],
      },
    },
  };
  runtime.activate(entrypoint);

  expect(runtime.requirements(entrypoint, 'task')).toMatchObject({
    required: true,
    intent: 'session',
    methods: ['custom-session'],
  });
});

test('classifies Tempo management credentials without treating content vouchers as management', async () => {
  const runtime = await buildTaskSessionRuntime();
  const entrypoint: EntrypointDef = {
    key: 'session-purpose',
    price: '1',
    metadata: { mpp: { intent: 'session', methods: ['tempo'] } },
  };
  runtime.activate(entrypoint);
  const requirement = runtime.requirements(entrypoint, 'invoke');
  const challenged = await runtime.authorize(
    new Request('https://agent.test/session-purpose', { method: 'POST' }),
    entrypoint,
    'invoke',
    requirement
  );
  if (challenged.authorized) throw new Error('expected challenge');
  const challenge = Challenge.fromResponse(challenged.response);
  const requestFor = (
    action: 'open' | 'topUp' | 'voucher' | 'close',
    body?: string
  ) =>
    new Request('https://agent.test/session-purpose', {
      method: 'POST',
      headers: {
        Authorization: Credential.serialize({
          challenge,
          payload: { action },
        }),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    });

  expect(runtime.credentialPurpose(requestFor('topUp'))).toBe('management');
  expect(runtime.credentialPurpose(requestFor('close'))).toBe('management');
  expect(runtime.credentialPurpose(requestFor('open'))).toBe('content');
  expect(runtime.credentialPurpose(requestFor('voucher'))).toBe('management');
  expect(
    runtime.credentialPurpose(
      requestFor('voucher', JSON.stringify({ input: { prompt: 'hello' } }))
    )
  ).toBe('content');
  expect(
    runtime.credentialPurpose(
      new Request('https://agent.test/session-purpose', {
        headers: { Authorization: 'Bearer unrelated' },
      })
    )
  ).toBeUndefined();
});

test('native Tempo stream authorization exposes a durable session meter', async () => {
  const store = createInMemoryTempoSessionStore();
  const salt = `0x${'11'.repeat(32)}` as Hex;
  const expiringNonceHash = `0x${'22'.repeat(32)}` as Hex;
  const descriptor = {
    payer: payer.address,
    payee: payee.address,
    operator: zeroAddress,
    token,
    salt,
    authorizedSigner: payer.address,
    expiringNonceHash,
  };
  const escrow = Tempo.Session.Precompile.Constants.tip20ChannelEscrow;
  const channelId = Tempo.Session.Precompile.Channel.computeId({
    ...descriptor,
    chainId,
    escrow,
  });
  const signature = await Tempo.Session.Precompile.Voucher.signVoucher(
    payerClient,
    payer,
    { channelId, cumulativeAmount: 2n },
    escrow,
    chainId
  );
  await store.put(channelId, {
    backend: 'precompile',
    channelId,
    chainId,
    escrowContract: escrow,
    closeRequestedAt: 0n,
    payer: payer.address,
    payee: payee.address,
    token,
    authorizedSigner: payer.address,
    deposit: 3n,
    settledOnChain: 0n,
    highestVoucherAmount: 2n,
    highestVoucher: { channelId, cumulativeAmount: 2n, signature },
    spent: 0n,
    units: 0,
    finalized: false,
    createdAt: new Date().toISOString(),
    descriptor,
    operator: descriptor.operator,
    salt,
    expiringNonceHash,
  });

  const extension = mpp({
    config: {
      methods: [
        tempo.session({
          mode: 'development',
          account: payee,
          chainId,
          currency: token,
          recipient: payee.address,
          decimals: 0,
          amount: '1',
          unitType: 'chunk',
          deposit: { minimum: '1', suggested: '2', maximum: '3' },
          store,
          channelStateTtlMs: Number.MAX_SAFE_INTEGER,
          getClient: () => serverClient,
        }),
      ],
      defaultIntent: 'session',
      secretKey: 'tempo-session-test-secret-key-32-bytes',
    },
  });
  const buildContext = {
    meta: { name: 'session-test', version: '1.0.0' },
    runtime: {},
  } as BuildContext;
  const slice = await extension.build(buildContext);
  if (!slice.mpp) throw new Error('expected MPP runtime');
  const entrypoint: EntrypointDef = {
    key: 'stream',
    price: { invoke: '99', stream: '99' },
    metadata: { mpp: { intent: 'session' } },
    handler: async () => ({ output: { ok: true } }),
    stream: async () => ({ status: 'succeeded' }),
  };
  slice.mpp.activate(entrypoint);
  const requirement = slice.mpp.requirements(entrypoint, 'stream');
  if (!requirement.required) throw new Error('expected payment requirement');
  expect(requirement.amount).toBe('1');

  const managementChallenge = await slice.mpp.authorize(
    new Request('https://agent.test/stream', { method: 'POST' }),
    entrypoint,
    'stream',
    requirement
  );
  if (managementChallenge.authorized) throw new Error('expected challenge');
  const management = await slice.mpp.authorize(
    new Request('https://agent.test/stream', {
      method: 'POST',
      headers: {
        Authorization: Credential.serialize({
          challenge: Challenge.fromResponse(managementChallenge.response),
          source: `did:pkh:eip155:${chainId}:${payer.address}`,
          payload: {
            action: 'voucher',
            channelId,
            descriptor,
            cumulativeAmount: '2',
            signature,
          },
        }),
      },
    }),
    entrypoint,
    'stream',
    requirement
  );
  expect(management).toMatchObject({
    authorized: true,
    handled: { status: 204 },
  });
  if (!management.authorized) throw new Error('expected management response');
  expect(management.sessionMeter).toBeUndefined();
  expect(await store.get(channelId)).toMatchObject({ spent: 0n, units: 0 });

  const challenged = await slice.mpp.authorize(
    new Request('https://agent.test/stream', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: '{"prompt":"hello"}',
    }),
    entrypoint,
    'stream',
    requirement
  );
  if (challenged.authorized) throw new Error('expected challenge');
  const challenge = Challenge.fromResponse(challenged.response);
  const authorized = await slice.mpp.authorize(
    new Request('https://agent.test/stream', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: Credential.serialize({
          challenge,
          source: `did:pkh:eip155:${chainId}:${payer.address}`,
          payload: {
            action: 'voucher',
            channelId,
            descriptor,
            cumulativeAmount: '2',
            signature,
          },
        }),
      },
      body: '{"prompt":"hello"}',
    }),
    entrypoint,
    'stream',
    requirement
  );

  expect(authorized).toMatchObject({
    authorized: true,
    payer: `did:pkh:eip155:${chainId}:${payer.address}`,
    network: `eip155:${chainId}`,
    payment: {
      amount: '3',
      currency: token,
      intent: 'session',
      method: 'tempo',
    },
    accounting: {
      intent: 'session',
      reference: channelId,
      maximumAmount: '3',
    },
    sessionMeter: {
      channelId,
      unitType: 'chunk',
      unitAmount: '1',
      maximumAmount: '3',
    },
  });
  if (!authorized.authorized || !authorized.sessionMeter) {
    throw new Error('expected session meter');
  }
  expect((await authorized.sessionMeter.charge()).status).toBe('charged');
  expect((await authorized.sessionMeter.receipt()).data).toMatchObject({
    channelId,
    spent: '1',
    units: 1,
  });

  const invokeRequirement = slice.mpp.requirements(entrypoint, 'invoke');
  if (!invokeRequirement.required) {
    throw new Error('expected invoke payment requirement');
  }
  const invokeChallengeResult = await slice.mpp.authorize(
    new Request('https://agent.test/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"prompt":"invoke"}',
    }),
    entrypoint,
    'invoke',
    invokeRequirement
  );
  if (invokeChallengeResult.authorized) throw new Error('expected challenge');
  const invokeRequest = new Request('https://agent.test/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'tempo-session-invoke-recovery-0001',
      Authorization: Credential.serialize({
        challenge: Challenge.fromResponse(invokeChallengeResult.response),
        source: `did:pkh:eip155:${chainId}:${payer.address}`,
        payload: {
          action: 'voucher',
          channelId,
          descriptor,
          cumulativeAmount: '2',
          signature,
        },
      }),
    },
    body: '{"prompt":"invoke"}',
  });
  const invokeRetry = invokeRequest.clone();
  const invokeAuthorization = await slice.mpp.authorize(
    invokeRequest,
    entrypoint,
    'invoke',
    invokeRequirement,
    { allowIdempotencyRecovery: true }
  );
  expect(invokeAuthorization).toMatchObject({
    authorized: true,
    payment: { amount: '1', intent: 'session' },
    accounting: { intent: 'charge' },
  });
  if (!invokeAuthorization.authorized) {
    throw new Error('expected invoke authorization');
  }
  const recoveredInvoke = await slice.mpp.authorize(
    invokeRetry,
    entrypoint,
    'invoke',
    invokeRequirement,
    { allowIdempotencyRecovery: true }
  );
  expect(recoveredInvoke).toMatchObject({
    authorized: true,
    payment: { amount: '1', intent: 'session' },
    accounting: { intent: 'charge' },
  });
  expect(invokeAuthorization.sessionMeter).toBeUndefined();
  expect(await store.get(channelId)).toMatchObject({
    spent: 2n,
    units: 2,
  });
  await store.close();
});
