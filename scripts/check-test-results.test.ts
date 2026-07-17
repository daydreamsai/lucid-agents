import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertCleanTestRun,
  checkTestReports,
  summarizeJunit,
} from './check-test-results';

describe('JUnit test-result gate', () => {
  it('accepts a complete passing run', () => {
    const summary = summarizeJunit(
      '<testsuites tests="12" failures="0" errors="0" skipped="0"></testsuites>'
    );

    expect(summary).toEqual({ tests: 12, failures: 0, errors: 0, skipped: 0 });
    expect(() => assertCleanTestRun(summary)).not.toThrow();
    expect(
      summarizeJunit(
        '<testsuites tests="1" failures="0" skipped="0"></testsuites>'
      )
    ).toEqual({ tests: 1, failures: 0, errors: 0, skipped: 0 });
  });

  it('rejects skipped tests', () => {
    const summary = summarizeJunit(
      '<testsuites tests="12" failures="0" errors="0" skipped="2"></testsuites>'
    );

    expect(() => assertCleanTestRun(summary)).toThrow('2 skipped');
  });

  it('rejects failures and malformed reports', () => {
    expect(() =>
      assertCleanTestRun({ tests: 12, failures: 1, errors: 1, skipped: 0 })
    ).toThrow('1 failed, 1 errored');
    expect(() => summarizeJunit('<testsuite tests="1"></testsuite>')).toThrow(
      'testsuites summary'
    );
    expect(() => summarizeJunit('<testsuites tests="1"></testsuites>')).toThrow(
      'missing failures'
    );
    expect(() =>
      assertCleanTestRun({ tests: 0, failures: 0, errors: 0, skipped: 0 })
    ).toThrow('no tests');
  });

  it('loads and aggregates report files while rejecting missing reports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lucid-test-results-'));
    const first = join(directory, 'first.xml');
    const second = join(directory, 'second.xml');
    await Bun.write(
      first,
      '<testsuites tests="4" failures="0" errors="0" skipped="0"></testsuites>'
    );
    await Bun.write(
      second,
      '<testsuites tests="6" failures="0" errors="0" skipped="0"></testsuites>'
    );

    try {
      await expect(checkTestReports([first, second])).resolves.toEqual({
        tests: 10,
        failures: 0,
        errors: 0,
        skipped: 0,
      });
      await expect(
        checkTestReports([join(directory, 'missing.xml')])
      ).rejects.toThrow('JUnit report not found');
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
