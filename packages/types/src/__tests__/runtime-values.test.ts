import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { ZodValidationError } from '../core/context';
import {
  DEFAULT_OASF_RECORD_PATH,
  DEFAULT_OASF_VERSION,
  OASF_STRICT_MODE_ERROR,
} from '../identity';

describe('shared runtime values', () => {
  it('preserves validation kind, issues, and direction-specific messages', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    if (result.success) throw new Error('expected invalid fixture');

    const input = new ZodValidationError('input', result.error.issues);
    const output = new ZodValidationError('output', result.error.issues);

    expect(input).toBeInstanceOf(Error);
    expect(input.kind).toBe('input');
    expect(input.issues).toBe(result.error.issues);
    expect(input.message).toBe('Invalid input provided');
    expect(output.message).toBe('Invalid output produced');
  });

  it('exposes stable OASF defaults from the identity contract', () => {
    expect(DEFAULT_OASF_VERSION).toBe('0.8.0');
    expect(DEFAULT_OASF_RECORD_PATH).toBe('/.well-known/oasf-record.json');
    expect(OASF_STRICT_MODE_ERROR).toContain('OASF strict mode');
  });
});
