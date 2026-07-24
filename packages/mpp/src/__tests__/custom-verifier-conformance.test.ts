import type { MppCredentialVerifier } from '@lucid-agents/types/mpp';
import { describe, expect, test } from 'bun:test';

import {
  CustomMppConformanceConfigurationError,
  CustomMppConformanceFixtureError,
  runCustomMppHttpConformance,
  runCustomMppVerifierConformance,
  type CustomMppConformanceCredentialFactory,
  type CustomMppConformanceCredentialInspector,
  type CustomMppHttpConformanceOptions,
} from '../conformance';
import { custom } from '../methods';
import { Challenge } from 'mppx';

const REFERENCE_SECRET = 'reference-custom-verifier-conformance-secret';

function encoded(value: ArrayBuffer): string {
  return Buffer.from(value).toString('base64url');
}

function canonicalClaim(payload: Record<string, unknown>): string {
  return JSON.stringify([
    payload.challengeId,
    payload.amount,
    payload.currency,
    payload.recipient,
    payload.method,
    payload.intent,
    payload.payer,
    payload.expires,
    payload.settled,
  ]);
}

async function signClaim(payload: Record<string, unknown>): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(REFERENCE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return encoded(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(canonicalClaim(payload))
    )
  );
}

const referenceCredentialFor: CustomMppConformanceCredentialFactory = async ({
  challenge,
  scenario,
}) => {
  const payload: Record<string, unknown> = {
    challengeId: challenge.id,
    amount: challenge.request.amount,
    currency: challenge.request.currency,
    expires: challenge.request.expires,
    intent: challenge.intent,
    method: challenge.method,
    payer: 'did:example:buyer',
    recipient: challenge.request.recipient,
    settled: true,
  };
  if (scenario === 'expired-credential') {
    payload.expires = '2000-01-01T00:00:00.000Z';
  } else if (scenario === 'wrong-amount') {
    payload.amount = '8';
  } else if (scenario === 'wrong-currency') {
    payload.currency = 'eur';
  } else if (scenario === 'wrong-recipient') {
    payload.recipient = 'merchant-other';
  } else if (scenario === 'wrong-method') {
    payload.method = 'other-pay';
  } else if (scenario === 'wrong-intent') {
    payload.intent = 'session';
  } else if (scenario === 'wrong-challenge') {
    payload.challengeId = 'other-challenge';
  } else if (scenario === 'wrong-payer') {
    payload.payer = 'did:example:other';
  } else if (scenario === 'unsettled-payment') {
    payload.settled = false;
  }
  payload.signature = await signClaim(payload);
  if (scenario === 'invalid-authenticity') {
    payload.signature = 'invalid-signature';
  }
  return {
    payload,
    source: 'did:example:buyer',
  };
};

const inspectReferenceCredential: CustomMppConformanceCredentialInspector =
  async (credential, context) => {
    const payload = credential.payload;
    return {
      authenticity:
        typeof payload.signature === 'string' &&
        payload.signature === (await signClaim(payload))
          ? 'valid'
          : 'invalid',
      challenge:
        payload.challengeId === context.challenge.id ? 'issued' : 'other',
      amount:
        payload.amount === context.requirement.amount ? 'required' : 'other',
      currency:
        payload.currency === context.requirement.currency
          ? 'required'
          : 'other',
      recipient:
        payload.recipient === context.challenge.request.recipient
          ? 'required'
          : 'other',
      method:
        payload.method === context.challenge.method ? 'required' : 'other',
      intent:
        payload.intent === context.requirement.intent ? 'required' : 'other',
      payer:
        payload.payer === credential.source &&
        credential.source === 'did:example:buyer'
          ? 'expected'
          : 'other',
      validity:
        typeof payload.expires === 'string' &&
        Date.parse(payload.expires) > Date.now()
          ? 'current'
          : 'expired',
      settlement: payload.settled === true ? 'settled' : 'unsettled',
    };
  };

const referenceVerifier: MppCredentialVerifier = async context => {
  const payload = context.credential.payload;
  if (
    typeof payload.signature !== 'string' ||
    payload.signature !== (await signClaim(payload)) ||
    payload.challengeId !== context.credential.challenge.id ||
    payload.amount !== context.requirement.amount ||
    payload.currency !== context.requirement.currency ||
    payload.recipient !== context.credential.challenge.request.recipient ||
    payload.method !== context.credential.challenge.method ||
    payload.intent !== context.requirement.intent ||
    payload.payer !== context.credential.source ||
    typeof payload.expires !== 'string' ||
    Date.parse(payload.expires) <= Date.now() ||
    payload.settled !== true
  ) {
    return { valid: false, reason: 'invalid provider credential' };
  }
  return {
    valid: true,
    receipt: 'acme-settlement-reference',
    payer: 'did:example:buyer',
    network: 'acme:test',
  };
};

describe('custom MPP verifier conformance', () => {
  test('reports every trust-boundary gap in an intentionally incomplete verifier', async () => {
    const incompleteVerifier: MppCredentialVerifier = async () => ({
      valid: true,
      receipt: 'incomplete-receipt',
    });

    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', {
        recipient: 'merchant-42',
      }),
      amount: '7',
      currency: 'usd',
      verifier: incompleteVerifier,
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: {
        receipt: 'incomplete-receipt',
      },
    });

    expect(report.passed).toBe(false);
    expect(
      report.checks.filter(check => !check.passed).map(check => check.id)
    ).toEqual(
      expect.arrayContaining([
        'invalid-authenticity',
        'expired-credential',
        'wrong-amount',
        'wrong-currency',
        'wrong-recipient',
        'wrong-method',
        'wrong-intent',
        'wrong-challenge',
        'wrong-payer',
        'unsettled-payment',
      ])
    );
  });

  test('accepts a complete reference verifier for invoke and stream', async () => {
    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', {
        recipient: 'merchant-42',
      }),
      amount: '7',
      currency: 'usd',
      verifier: referenceVerifier,
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: {
        receipt: receipt => receipt.startsWith('acme-settlement-'),
        payer: 'did:example:buyer',
        network: 'acme:test',
      },
    });

    expect(report.passed).toBe(true);
    expect(report.checks.map(check => check.id)).toEqual(
      expect.arrayContaining([
        'valid-invoke',
        'valid-stream',
        'missing-credential',
        'malformed-credential',
        'wrong-route-binding',
        'wrong-body-binding',
        'single-use-replay',
        'concurrent-duplicate',
        'idempotent-recovery',
        'verifier-exception-redacted',
        'verifier-timeout-at-most-once',
        'malformed-result',
        'invalid-receipt',
      ])
    );
  });

  test('treats expected payer and network metadata as optional', async () => {
    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', {
        recipient: 'merchant-42',
      }),
      amount: '7',
      currency: 'usd',
      verifier: referenceVerifier,
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: {
        receipt: 'acme-settlement-reference',
      },
    });

    expect(report.passed).toBe(true);
  });

  test('does not accept verifier exceptions as invalid-credential handling', async () => {
    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', {
        recipient: 'merchant-42',
      }),
      amount: '7',
      currency: 'usd',
      verifier: async context => {
        if (context.credential.payload.scenario !== 'valid') {
          throw new Error('provider rejected by throwing');
        }
        return {
          valid: true,
          receipt: 'exception-provider-receipt',
        };
      },
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: {
        receipt: 'exception-provider-receipt',
      },
    });

    expect(report.passed).toBe(false);
    expect(
      report.checks.filter(check => !check.passed).map(check => check.id)
    ).toEqual(expect.arrayContaining(['invalid-authenticity']));
  });

  test('rejects one malformed fixture reused for every trust-boundary scenario', async () => {
    const reusedFixture: CustomMppConformanceCredentialFactory = async () => ({
      payload: { malformed: true },
      source: 'did:example:buyer',
    });

    await expect(
      runCustomMppVerifierConformance({
        method: custom.server('acme-pay', { recipient: 'merchant-42' }),
        amount: '7',
        currency: 'usd',
        verifier: referenceVerifier,
        credentialFor: reusedFixture,
        inspectCredential: inspectReferenceCredential,
        expected: {
          receipt: 'acme-settlement-reference',
          payer: 'did:example:buyer',
          network: 'acme:test',
        },
      })
    ).rejects.toBeInstanceOf(CustomMppConformanceFixtureError);
  });

  test('bounds slow verifier checks with the runner-owned deadline', async () => {
    const startedAt = performance.now();
    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', { recipient: 'merchant-42' }),
      amount: '7',
      currency: 'usd',
      verifier: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { valid: true, receipt: 'late-receipt' };
      },
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: { receipt: 'late-receipt' },
      caseTimeoutMs: 20,
    });

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(report.passed).toBe(false);
  });

  test('completes when a verifier never resolves', async () => {
    const startedAt = performance.now();
    const report = await runCustomMppVerifierConformance({
      method: custom.server('acme-pay', { recipient: 'merchant-42' }),
      amount: '7',
      currency: 'usd',
      verifier: () => new Promise<never>(() => {}),
      credentialFor: referenceCredentialFor,
      inspectCredential: inspectReferenceCredential,
      expected: { receipt: 'never-returned' },
      caseTimeoutMs: 20,
    });

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(report.passed).toBe(false);
  });
});

function syntheticChallenge(): Response {
  const challenge = Challenge.from({
    id: crypto.randomUUID(),
    realm: 'conformance.test',
    method: 'acme-pay',
    intent: 'charge',
    request: {
      amount: '7',
      currency: 'usd',
      recipient: 'merchant-42',
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
  });
  return new Response(null, {
    status: 402,
    headers: { 'WWW-Authenticate': Challenge.serialize(challenge) },
  });
}

describe('custom MPP HTTP conformance', () => {
  test('covers success and every isolated public failure lifecycle', async () => {
    let successReceipt = 'provider-receipt';
    const options = {
      serviceFor(scenario) {
        let authorizedRequests = 0;
        return {
          request(operation, authorization) {
            if (!authorization) return Promise.resolve(syntheticChallenge());
            if (
              authorization === 'Payment not-base64url' ||
              authorization !== 'Payment valid'
            ) {
              return Promise.resolve(
                new Response('fresh challenge', { status: 402 })
              );
            }
            authorizedRequests += 1;
            if (scenario === 'success') {
              return Promise.resolve(
                new Response(operation, {
                  status: 200,
                  headers: { 'Payment-Receipt': successReceipt },
                })
              );
            }
            if (scenario === 'handler-failure') {
              return Promise.resolve(
                new Response('safe handler failure', {
                  status: 500,
                  headers: { 'Payment-Receipt': 'provider-receipt' },
                })
              );
            }
            return Promise.resolve(
              new Response('safe provider failure', {
                status: authorizedRequests === 1 ? 503 : 402,
              })
            );
          },
          createCredential(_challenge, _operation, credentialScenario) {
            return Promise.resolve(`Payment ${credentialScenario}`);
          },
          metrics() {
            if (scenario === 'success') {
              return Promise.resolve({
                handlerCalls: 1,
                streamCalls: 1,
                settlementCalls: 2,
                accountingCount: 2,
                accountingTotal: '14',
                reservationCount: 0,
                reservationTotal: '0',
              });
            }
            return Promise.resolve({
              handlerCalls: scenario === 'handler-failure' ? 1 : 0,
              streamCalls: 0,
              settlementCalls:
                scenario === 'handler-failure' ||
                scenario === 'settlement-failure' ||
                scenario === 'verifier-timeout'
                  ? 1
                  : 0,
              accountingCount: 0,
              accountingTotal: '0',
              reservationCount: 0,
              reservationTotal: '0',
            });
          },
          close() {
            return Promise.resolve();
          },
        };
      },
      expected: {
        receipt: (receipt: string) => receipt.startsWith('provider-receipt'),
        successfulAccountingCount: 2,
        successfulAccountingTotal: '14',
      },
      forbiddenResponseFragments: ['provider-secret'] as const,
      caseTimeoutMs: 100,
    } satisfies CustomMppHttpConformanceOptions;
    const report = await runCustomMppHttpConformance(options);

    expect(report.passed).toBe(true);
    expect(report.checks.map(check => check.id)).toEqual(
      expect.arrayContaining([
        'http-invalid-authenticity',
        'http-expired-credential',
        'http-wrong-context',
        'http-verifier-timeout',
        'http-verifier-timeout-replay',
      ])
    );

    successReceipt = 'provider-receipt-provider-secret';
    const leakedReceiptReport = await runCustomMppHttpConformance(options);
    expect(
      leakedReceiptReport.checks.find(
        check => check.id === 'http-success-invoke'
      )?.passed
    ).toBe(false);
  });

  test('rejects missing redaction markers before creating services', async () => {
    await expect(
      runCustomMppHttpConformance({
        serviceFor: () => {
          throw new Error('must not run');
        },
        expected: {
          receipt: 'unused',
          successfulAccountingCount: 0,
          successfulAccountingTotal: '0',
        },
        forbiddenResponseFragments: [] as unknown as readonly [
          string,
          ...string[],
        ],
      })
    ).rejects.toBeInstanceOf(CustomMppConformanceConfigurationError);
  });
});
