import { describe, expect, test } from 'bun:test';

import { inspectX402Cohort } from './check-x402-cohort';

const coherentCatalog = {
  workspaces: {
    catalog: {
      '@x402/core': '2.19.0',
      '@x402/extensions': '2.19.0',
      '@x402/fetch': '2.19.0',
      '@x402/evm': '2.19.0',
      '@x402/svm': '2.19.0',
    },
  },
};

describe('x402 dependency cohort check', () => {
  test('accepts one coherent catalog and lockfile cohort', () => {
    const result = inspectX402Cohort(
      coherentCatalog,
      '"@x402/core": ["@x402/core@2.19.0"]\n' +
        '"@x402/evm": ["@x402/evm@2.19.0"]\n' +
        '"@x402/extensions": ["@x402/extensions@2.19.0"]\n' +
        '"@x402/fetch": ["@x402/fetch@2.19.0"]\n' +
        '"@x402/svm": ["@x402/svm@2.19.0"]'
    );

    expect(result).toEqual({ version: '2.19.0', errors: [] });
  });

  test('rejects a nested stale core resolution', () => {
    const result = inspectX402Cohort(
      coherentCatalog,
      '"@x402/core": ["@x402/core@2.19.0"]\n' +
        '"@x402/evm/@x402/core": ["@x402/core@2.2.0"]'
    );

    expect(result.errors).toContain(
      'Resolved @x402/core versions are mixed: 2.19.0, 2.2.0'
    );
  });

  test('rejects catalog packages from different release families', () => {
    const result = inspectX402Cohort(
      {
        workspaces: {
          catalog: {
            ...coherentCatalog.workspaces.catalog,
            '@x402/svm': '2.18.0',
          },
        },
      },
      '"@x402/core": ["@x402/core@2.19.0"]'
    );

    expect(result.errors).toContain(
      'Catalog x402 versions are mixed: 2.18.0, 2.19.0'
    );
  });
});
