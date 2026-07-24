import { describe, expect, test } from 'bun:test';

import { inspectMppCohort } from './check-mpp-cohort';

describe('MPP dependency cohort check', () => {
  test('accepts exact matching mppx and viem catalog and lockfile versions', () => {
    const result = inspectMppCohort(
      {
        workspaces: {
          catalog: {
            mppx: '0.8.14',
            viem: '2.55.8',
          },
        },
      },
      '"mppx": ["mppx@0.8.14"]\n' +
        '"viem": ["viem@2.55.8"]\n' +
        '"other/viem": ["viem@2.23.2"]'
    );

    expect(result).toEqual({
      mppx: '0.8.14',
      viem: '2.55.8',
      errors: [],
    });
  });

  test('rejects ranged catalog versions', () => {
    const result = inspectMppCohort(
      {
        workspaces: {
          catalog: {
            mppx: '^0.8.14',
            viem: '~2.55.8',
          },
        },
      },
      '"mppx": ["mppx@0.8.14"]\n"viem": ["viem@2.55.8"]'
    );

    expect(result.errors).toContain(
      'Catalog mppx must be pinned exactly, found ^0.8.14'
    );
    expect(result.errors).toContain(
      'Catalog viem must be pinned exactly, found ~2.55.8'
    );
  });

  test('rejects direct lockfile versions that differ from the catalog', () => {
    const result = inspectMppCohort(
      {
        workspaces: {
          catalog: {
            mppx: '0.8.14',
            viem: '2.55.8',
          },
        },
      },
      '"mppx": ["mppx@0.8.13"]\n"viem": ["viem@2.55.2"]'
    );

    expect(result.errors).toContain(
      'Catalog mppx version 0.8.14 does not match direct resolved mppx 0.8.13'
    );
    expect(result.errors).toContain(
      'Catalog viem version 2.55.8 does not match direct resolved viem 2.55.2'
    );
  });
});
