import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { policiesFromConfig } from '../env';
import { loadPoliciesFromConfig } from '../policy-config';
import { PaymentPolicyGroupsSchema } from '../policy-schema';

const directories: string[] = [];

const fixturePath = (contents: string): string => {
  const directory = mkdtempSync(join(tmpdir(), 'lucid-policy-'));
  directories.push(directory);
  const path = join(directory, 'payment-policies.json');
  writeFileSync(path, contents);
  return path;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('payment policy configuration', () => {
  it('loads and validates a complete policy through the public environment helper', () => {
    const policy = {
      name: 'bounded',
      outgoingLimits: {
        global: { maxPaymentUsd: 5, maxTotalUsd: 20, windowMs: 1_000 },
        perTarget: { 'https://agent.example': { maxTotalUsd: 10 } },
        perEndpoint: { '/invoke': { maxPaymentUsd: 2 } },
      },
      incomingLimits: {
        global: { maxTotalUsd: 100 },
        perSender: { '0xabc': { maxPaymentUsd: 3 } },
        perEndpoint: { '/invoke': { windowMs: 5_000 } },
      },
      allowedRecipients: ['https://agent.example'],
      blockedRecipients: ['https://blocked.example'],
      allowedSenders: ['0xabc'],
      blockedSenders: ['0xdef'],
      rateLimits: { maxPayments: 4, windowMs: 10_000 },
    };

    expect(policiesFromConfig(fixturePath(JSON.stringify([policy])))).toEqual([
      policy,
    ]);
  });

  it('returns undefined for a missing optional config file', () => {
    expect(loadPoliciesFromConfig('/path/that/does/not/exist.json')).toBe(
      undefined
    );
  });

  it('distinguishes malformed JSON from schema validation failures', () => {
    expect(() => loadPoliciesFromConfig(fixturePath('{'))).toThrow(
      'Failed to parse payment-policies.json'
    );
    expect(() =>
      loadPoliciesFromConfig(
        fixturePath(
          JSON.stringify([{ name: '', rateLimits: { maxPayments: 0 } }])
        )
      )
    ).toThrow('Invalid payment policies config');
  });

  it('enforces positive limits while accepting a minimal named policy', () => {
    expect(
      PaymentPolicyGroupsSchema.safeParse([{ name: 'minimal' }]).success
    ).toBe(true);
    expect(
      PaymentPolicyGroupsSchema.safeParse([
        { name: 'invalid', incomingLimits: { global: { windowMs: -1 } } },
      ]).success
    ).toBe(false);
  });
});
