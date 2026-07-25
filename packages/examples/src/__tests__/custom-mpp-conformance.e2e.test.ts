import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { mpp } from '@lucid-agents/mpp';
import { runCustomMppHttpConformance } from '@lucid-agents/mpp/conformance';
import {
  createInMemoryPaymentStorage,
  payments,
  type PaymentStorage,
} from '@lucid-agents/payments';
import { afterEach, describe, expect, test } from 'bun:test';
import { Challenge, Credential } from 'mppx';
import { z } from 'zod';

import { createReferenceCustomMppMethod } from '../mpp/custom-verifier-reference';

const servers: Array<ReturnType<typeof Bun.serve>> = [];
const agents: Array<{ close(): Promise<void> }> = [];

function trackedPaymentStorage(): {
  storage: PaymentStorage;
  reservations(): { reservationCount: number; reservationTotal: string };
} {
  const delegate = createInMemoryPaymentStorage();
  const live = new Map<string, bigint>();
  const staged = new Map<string, bigint>();
  const storage: PaymentStorage = {
    recordPayment: record => delegate.recordPayment(record),
    getTotal: (groupName, scope, direction, windowMs) =>
      delegate.getTotal(groupName, scope, direction, windowMs),
    getAllRecords: (groupName, scope, direction, windowMs) =>
      delegate.getAllRecords(groupName, scope, direction, windowMs),
    async reservePaymentLimit(reservation) {
      const result = await delegate.reservePaymentLimit(reservation);
      if (result.allowed) live.set(result.reservationId, reservation.amount);
      return result;
    },
    async commitPaymentReservation(reservationId) {
      const committed = await delegate.commitPaymentReservation(reservationId);
      if (committed) live.delete(reservationId);
      return committed;
    },
    async commitPaymentReservations(reservationIds, records) {
      const committed = await delegate.commitPaymentReservations(
        reservationIds,
        records
      );
      if (committed) {
        for (const reservationId of reservationIds) live.delete(reservationId);
      }
      return committed;
    },
    async stagePaymentSettlement(reservationIds, records, adjustments) {
      const settlementId = await delegate.stagePaymentSettlement(
        reservationIds,
        records,
        adjustments
      );
      if (settlementId) {
        const adjusted = new Map(
          adjustments?.map(value => [value.reservationId, value.amount]) ?? []
        );
        const total = reservationIds.reduce(
          (sum, reservationId) =>
            sum +
            (adjusted.get(reservationId) ?? live.get(reservationId) ?? 0n),
          0n
        );
        for (const reservationId of reservationIds) live.delete(reservationId);
        staged.set(settlementId, total);
      }
      return settlementId;
    },
    adjustPaymentSettlement: (settlementId, adjustments) =>
      delegate.adjustPaymentSettlement(settlementId, adjustments),
    async commitPaymentSettlement(settlementId) {
      const committed = await delegate.commitPaymentSettlement(settlementId);
      if (committed) staged.delete(settlementId);
      return committed;
    },
    async releasePaymentSettlement(settlementId) {
      await delegate.releasePaymentSettlement(settlementId);
      staged.delete(settlementId);
    },
    async releasePaymentReservation(reservationId) {
      await delegate.releasePaymentReservation(reservationId);
      live.delete(reservationId);
    },
    async clear() {
      await delegate.clear();
      live.clear();
      staged.clear();
    },
    close: () => delegate.close?.(),
  };
  return {
    storage,
    reservations() {
      const amounts = [...live.values(), ...staged.values()];
      return {
        reservationCount: amounts.length,
        reservationTotal: amounts
          .reduce((total, amount) => total + amount, 0n)
          .toString(),
      };
    },
  };
}

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  await Promise.all(agents.splice(0).map(agent => agent.close()));
});

async function createProtectedService(options?: {
  failHandler?: boolean;
  failSettlement?: boolean;
  timeoutVerifier?: boolean;
}) {
  let handlerCalls = 0;
  let streamCalls = 0;
  let settlementCalls = 0;
  const reference = createReferenceCustomMppMethod({
    name: 'acme-pay',
    secret: 'reference-provider-secret-at-least-32-bytes',
    recipient: 'merchant-42',
    payer: 'did:example:buyer',
    network: 'acme:test',
    async settle({ challengeId }) {
      settlementCalls += 1;
      if (options?.timeoutVerifier) {
        return new Promise<never>(() => {});
      }
      if (options?.failSettlement) {
        throw new Error('sk_provider_settlement_secret');
      }
      return { receipt: `acme_${challengeId}` };
    },
  });
  const trackedStorage = trackedPaymentStorage();
  const agent = await createAgent({
    name: 'custom-mpp-e2e',
    version: '1.0.0',
  })
    .use(http())
    .use(
      payments({
        config: {
          payTo: '0x0000000000000000000000000000000000000001',
          network: 'eip155:84532',
          facilitatorUrl: 'https://facilitator.invalid',
          policyGroups: [
            {
              name: 'custom-mpp-revenue',
              incomingLimits: { global: { maxPaymentUsd: 100 } },
            },
          ],
        },
        storageFactory: () => trackedStorage.storage,
      })
    )
    .use(
      mpp({
        allowInsecureHttpForDevelopment: true,
        config: {
          methods: [reference.method],
          currency: 'usd',
          secretKey: 'custom-mpp-e2e-secret-key-32-bytes',
          verifyCredential: options?.timeoutVerifier
            ? context =>
                Promise.race([
                  reference.verifier(context),
                  new Promise<never>((_resolve, reject) => {
                    setTimeout(
                      () => reject(new Error('sk_provider_timeout_secret')),
                      10
                    );
                  }),
                ])
            : reference.verifier,
        },
      })
    )
    .use(analytics())
    .build();
  agents.push(agent);
  const app = await createAgentApp(agent);
  app.addEntrypoint({
    key: 'custom-report',
    description: 'Reference custom MPP protected operation',
    price: { invoke: '7', stream: '7' },
    paymentProtocol: 'mpp',
    metadata: {
      mpp: {
        intent: 'charge',
        methods: ['acme-pay'],
      },
    },
    input: z.object({ fail: z.boolean().optional() }),
    output: z.object({ ok: z.boolean() }),
    handler: async () => {
      handlerCalls += 1;
      if (options?.failHandler) throw new Error('handler secret');
      return { output: { ok: true } };
    },
    stream: async (_context, emit) => {
      streamCalls += 1;
      await emit({ kind: 'text', text: 'custom payment accepted' });
      return { status: 'succeeded', output: { ok: true } };
    },
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: app.app.fetch.bind(app.app),
  });
  servers.push(server);
  if (server.port === undefined) throw new Error('Expected local server port');
  const origin = `http://127.0.0.1:${server.port}`;
  const request = (
    operation: 'invoke' | 'stream',
    input: { fail?: boolean },
    authorization?: string,
    idempotencyKey?: string
  ) =>
    fetch(`${origin}/entrypoints/custom-report/${operation}`, {
      method: 'POST',
      headers: {
        Accept:
          operation === 'stream' ? 'text/event-stream' : 'application/json',
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ input }),
    });
  return {
    agent,
    reference,
    request,
    counts: () => ({ handlerCalls, streamCalls, settlementCalls }),
    reservations: trackedStorage.reservations,
  };
}

describe('reference custom MPP protected service', () => {
  test('passes the reusable public HTTP lifecycle conformance suite', async () => {
    const report = await runCustomMppHttpConformance({
      async serviceFor(scenario) {
        const service = await createProtectedService({
          failHandler: scenario === 'handler-failure',
          failSettlement: scenario === 'settlement-failure',
          timeoutVerifier: scenario === 'verifier-timeout',
        });
        return {
          request: (operation, authorization) =>
            service.request(
              operation,
              { ...(scenario === 'handler-failure' ? { fail: true } : {}) },
              authorization
            ),
          createCredential: (challenge, _operation, credentialScenario) => {
            if (credentialScenario === 'expired-credential') {
              return service.reference.createCredential(challenge, {
                expires: '2000-01-01T00:00:00.000Z',
              });
            }
            if (credentialScenario === 'wrong-context') {
              return service.reference.createCredential(challenge, {
                recipient: 'merchant-other',
              });
            }
            if (credentialScenario === 'invalid-authenticity') {
              return Credential.serialize({
                challenge,
                payload: {
                  challengeId: challenge.id,
                  amount: challenge.request.amount,
                  currency: challenge.request.currency,
                  recipient: challenge.request.recipient,
                  method: challenge.method,
                  intent: challenge.intent,
                  payer: 'did:example:buyer',
                  expires: challenge.request.expires,
                  settled: true,
                  signature: 'invalid-signature',
                },
                source: 'did:example:buyer',
              });
            }
            return service.reference.createCredential(challenge);
          },
          async metrics() {
            const summary = (await service.agent.analytics.getData()).summary;
            return {
              ...service.counts(),
              accountingCount: summary.incomingCount,
              accountingTotal: summary.incomingTotal.toString(),
              ...service.reservations(),
            };
          },
        };
      },
      expected: {
        receipt: receipt => receipt.startsWith('acme_'),
        successfulAccountingCount: 2,
        successfulAccountingTotal: '14000000',
      },
      forbiddenResponseFragments: [
        'sk_provider_settlement_secret',
        'sk_provider_timeout_secret',
      ],
    });

    expect(report.passed).toBe(true);
  });

  test('settles invoke and stream exactly once with receipts and accounting', async () => {
    const service = await createProtectedService();

    const invokeChallenge = await service.request('invoke', {});
    expect(invokeChallenge.status).toBe(402);
    const invokeOffer = Challenge.fromResponse(invokeChallenge);
    expect(invokeOffer).toMatchObject({
      method: 'acme-pay',
      intent: 'charge',
      request: {
        amount: '7',
        currency: 'usd',
        recipient: 'merchant-42',
      },
    });
    const invoked = await service.request(
      'invoke',
      {},
      await service.reference.createCredential(invokeOffer)
    );
    expect(invoked.status).toBe(200);
    expect(invoked.headers.get('Payment-Receipt')).toStartWith('acme_');
    expect(await invoked.json()).toMatchObject({ output: { ok: true } });

    const streamChallenge = await service.request('stream', {});
    const streamOffer = Challenge.fromResponse(streamChallenge);
    const streamed = await service.request(
      'stream',
      {},
      await service.reference.createCredential(streamOffer)
    );
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get('Payment-Receipt')).toStartWith('acme_');
    expect(await streamed.text()).toContain('custom payment accepted');
    expect(service.counts()).toEqual({
      handlerCalls: 1,
      streamCalls: 1,
      settlementCalls: 2,
    });

    const data = await service.agent.analytics.getData();
    expect(data.summary).toMatchObject({
      incomingCount: 2,
      incomingTotal: 14_000_000n,
    });
    expect(data.transactions).toHaveLength(2);
    expect(data.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupName: 'custom-mpp-revenue',
          direction: 'incoming',
          amount: 7_000_000n,
        }),
      ])
    );
  });

  test('returns a paid failure receipt without recording successful handler accounting', async () => {
    const service = await createProtectedService({ failHandler: true });
    const challenged = await service.request('invoke', { fail: true });
    const challenge = Challenge.fromResponse(challenged);
    const authorization = await service.reference.createCredential(challenge);

    const failed = await service.request(
      'invoke',
      { fail: true },
      authorization
    );

    expect(failed.status).toBe(500);
    expect(failed.headers.get('Payment-Receipt')).toStartWith('acme_');
    expect(await failed.json()).toMatchObject({
      error: { code: 'internal_error' },
    });
    expect(service.counts()).toEqual({
      handlerCalls: 1,
      streamCalls: 0,
      settlementCalls: 1,
    });
    expect((await service.agent.analytics.getData()).summary).toMatchObject({
      incomingCount: 0,
      incomingTotal: 0n,
    });
  });

  test('fails closed and consumes an ambiguous settlement failure', async () => {
    const service = await createProtectedService({ failSettlement: true });
    const challenged = await service.request('invoke', {});
    const challenge = Challenge.fromResponse(challenged);
    const authorization = await service.reference.createCredential(challenge);

    const failed = await service.request('invoke', {}, authorization);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('Payment-Receipt')).toBeNull();
    expect(await failed.text()).not.toContain('sk_provider_settlement_secret');
    expect(service.counts()).toEqual({
      handlerCalls: 0,
      streamCalls: 0,
      settlementCalls: 1,
    });

    const replay = await service.request('invoke', {}, authorization);
    expect(replay.status).toBe(402);
    expect(service.counts().settlementCalls).toBe(1);
    expect((await service.agent.analytics.getData()).summary).toMatchObject({
      incomingCount: 0,
      incomingTotal: 0n,
    });
  });

  test('never invokes the handler for missing, malformed, expired, or rejected credentials', async () => {
    const service = await createProtectedService();

    expect((await service.request('invoke', {})).status).toBe(402);
    expect(
      (await service.request('invoke', {}, 'Payment not-base64url')).status
    ).toBe(402);

    const expiredChallenge = Challenge.fromResponse(
      await service.request('invoke', {})
    );
    const expired = await service.reference.createCredential(expiredChallenge, {
      expires: '2000-01-01T00:00:00.000Z',
    });
    expect((await service.request('invoke', {}, expired)).status).toBe(402);

    const rejectedChallenge = Challenge.fromResponse(
      await service.request('invoke', {})
    );
    const rejected = Credential.serialize({
      challenge: rejectedChallenge,
      payload: { signature: 'invalid' },
      source: 'did:example:buyer',
    });
    expect((await service.request('invoke', {}, rejected)).status).toBe(402);
    expect(service.counts()).toEqual({
      handlerCalls: 0,
      streamCalls: 0,
      settlementCalls: 0,
    });
  });
});
