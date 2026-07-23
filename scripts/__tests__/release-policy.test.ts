import { describe, expect, test } from 'bun:test';

import {
  REQUIRED_CI_JOB_IDS,
  ReleasePolicyError,
  assertReleaseContext,
  assertRequiredCiResults,
  assertVerifiedCheckout,
} from '../release-policy';

describe('assertRequiredCiResults', () => {
  test('accepts the complete required CI suite', () => {
    const results = Object.fromEntries(
      REQUIRED_CI_JOB_IDS.map(id => [id, { result: 'success' }])
    );

    expect(() => assertRequiredCiResults(results)).not.toThrow();
  });

  test('rejects missing, skipped, cancelled, or failed required jobs', () => {
    const results = Object.fromEntries(
      REQUIRED_CI_JOB_IDS.map(id => [id, { result: 'success' }])
    );
    delete results.generated_projects;
    results.tests = { result: 'failure' };
    results.docs = { result: 'skipped' };

    expect(() => assertRequiredCiResults(results)).toThrow(
      new ReleasePolicyError(
        'Required CI jobs did not succeed: tests=failure, generated_projects=missing, docs=skipped'
      )
    );
  });
});

describe('assertReleaseContext', () => {
  const validContext = {
    triggerRef: 'refs/heads/master',
    checkedOutSha: 'a'.repeat(40),
    masterSha: 'a'.repeat(40),
    ciRun: {
      workflowName: 'CI',
      event: 'push',
      headBranch: 'master',
      headSha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'success',
      requiredGateConclusion: 'success',
    },
  } as const;

  test('accepts only the exact master commit attested by the required CI gate', () => {
    expect(() => assertReleaseContext(validContext)).not.toThrow();
  });

  test('rejects a workflow dispatched from another ref', () => {
    expect(() =>
      assertReleaseContext({
        ...validContext,
        triggerRef: 'refs/heads/release-candidate',
      })
    ).toThrow('Releases must be triggered from refs/heads/master');
  });

  test('rejects a stale checkout after master advances', () => {
    expect(() =>
      assertReleaseContext({
        ...validContext,
        masterSha: 'b'.repeat(40),
      })
    ).toThrow('Checked out commit does not match the current master commit');
  });

  test('rejects CI success for a different commit', () => {
    expect(() =>
      assertReleaseContext({
        ...validContext,
        ciRun: {
          ...validContext.ciRun,
          headSha: 'c'.repeat(40),
        },
      })
    ).toThrow('CI attestation does not match the checked out master commit');
  });

  test('rejects a run without the required verification gate', () => {
    expect(() =>
      assertReleaseContext({
        ...validContext,
        ciRun: {
          ...validContext.ciRun,
          requiredGateConclusion: 'skipped',
        },
      })
    ).toThrow('Required release verification gate did not succeed');
  });
});

describe('assertVerifiedCheckout', () => {
  test('rejects a local checkout that differs from the attested source', () => {
    expect(() =>
      assertVerifiedCheckout('a'.repeat(40), 'b'.repeat(40))
    ).toThrow('Local checkout does not match the verified source commit');
  });
});
