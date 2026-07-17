import { describe, expect, it } from 'bun:test';

import { isCoverageSource, summarizeLcov } from './check-coverage';

describe('aggregate LCOV coverage', () => {
  it('excludes build output and test files from repository totals', () => {
    const summary = summarizeLcov(`
SF:packages/core/src/runtime.ts
FNF:4
FNH:3
LF:10
LH:7
end_of_record
SF:packages/core/dist/index.js
FNF:100
FNH:0
LF:100
LH:0
end_of_record
SF:packages/core/src/__tests__/runtime.test.ts
FNF:20
FNH:0
LF:20
LH:0
end_of_record
`);

    expect(summary).toEqual({
      files: 1,
      missingFiles: [],
      linesFound: 10,
      linesHit: 7,
      functionsFound: 4,
      functionsHit: 3,
      lineRate: 0.7,
      functionRate: 0.75,
    });
  });

  it('deduplicates repeated source records', () => {
    const summary = summarizeLcov(`
SF:packages/http/src/invoke.ts
FNF:5
FNH:4
LF:20
LH:16
end_of_record
SF:packages/http/src/invoke.ts
FNF:5
FNH:3
LF:20
LH:15
end_of_record
`);

    expect(summary.files).toBe(1);
    expect(summary.linesFound).toBe(20);
    expect(summary.linesHit).toBe(16);
    expect(summary.functionsFound).toBe(5);
    expect(summary.functionsHit).toBe(4);
  });

  it('reports executable production modules omitted from LCOV', () => {
    const summary = summarizeLcov(
      `
SF:packages/core/src/runtime.ts
FNF:4
FNH:4
LF:10
LH:10
end_of_record
`,
      ['packages/core/src/runtime.ts', 'packages/payments/src/runtime.ts']
    );

    expect(summary.missingFiles).toEqual(['packages/payments/src/runtime.ts']);
  });

  it('scopes executable package sources while excluding generated and type-only files', () => {
    expect(
      isCoverageSource(
        'packages/payments/src/runtime.ts',
        'export function createRuntime() { return {}; }'
      )
    ).toBe(true);
    expect(
      isCoverageSource(
        'packages/types/src/payments/index.ts',
        "export type { Payment } from './types';"
      )
    ).toBe(false);
    expect(
      isCoverageSource(
        'packages/api-sdk/src/generated/client.ts',
        'export function generatedClient() {}'
      )
    ).toBe(false);
    expect(
      isCoverageSource(
        'packages/api-sdk/src/sdk/client.gen.ts',
        'export function generatedClient() {}'
      )
    ).toBe(false);
    expect(
      isCoverageSource(
        'packages/examples/src/agent.ts',
        'export function exampleAgent() {}'
      )
    ).toBe(false);
  });
});
