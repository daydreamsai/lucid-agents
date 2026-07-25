import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import matrixSource from '../docs/payment-support-matrix.json';
import {
  paymentSupportMatrixPath,
  renderPaymentSupportMatrix,
  validatePaymentSupportMatrix,
} from './generate-payment-support-matrix';
import { packedPaymentStorageSubpaths } from './check-packed-payment-storage';

const repoRoot = join(import.meta.dir, '..');

describe('generated payment support matrix', () => {
  test('pins the released SDK cohorts and matches the checked-in output', async () => {
    const source = validatePaymentSupportMatrix(matrixSource);
    expect(source.sdkVersions).toEqual({
      x402: '2.19.0',
      mppx: '0.8.14',
    });
    expect(await readFile(paymentSupportMatrixPath, 'utf8')).toBe(
      renderPaymentSupportMatrix(source)
    );
  });

  test('rejects duplicate rows and invalid transport declarations', () => {
    const duplicate = structuredClone(matrixSource);
    duplicate.rows.push(structuredClone(duplicate.rows[0]!));
    expect(() => validatePaymentSupportMatrix(duplicate)).toThrow(
      'Duplicate payment support row id'
    );

    const invalid = structuredClone(matrixSource) as unknown as {
      rows: Array<{ transport: { stream: string } }>;
    };
    invalid.rows[0]!.transport.stream = 'maybe';
    expect(() => validatePaymentSupportMatrix(invalid)).toThrow(
      'transport.stream must be one of'
    );
  });

  test('declares every required storage subpath in package export maps', async () => {
    for (const [packageName, subpaths] of Object.entries(
      packedPaymentStorageSubpaths
    )) {
      const packageDirectory = packageName.endsWith('/payments')
        ? 'payments'
        : 'mpp';
      const manifest = JSON.parse(
        await readFile(
          join(repoRoot, 'packages', packageDirectory, 'package.json'),
          'utf8'
        )
      ) as {
        exports?: Record<
          string,
          { types?: string; import?: string; default?: string }
        >;
      };
      for (const subpath of subpaths) {
        expect(manifest.exports?.[subpath]).toMatchObject({
          types: expect.stringContaining('/'),
          import: expect.stringContaining('/'),
          default: expect.stringContaining('/'),
        });
      }
    }
  });
});
