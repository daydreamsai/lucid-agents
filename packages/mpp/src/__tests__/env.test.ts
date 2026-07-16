import { describe, expect, it } from 'bun:test';

import { custom, mppFromEnv } from '../index';

describe('mppFromEnv', () => {
  it('preserves an explicitly supplied credential verifier', () => {
    const verifyCredential = async () => ({ valid: true as const });

    const config = mppFromEnv({
      methods: [custom.server('test', {})],
      verifyCredential,
    });

    expect(config.verifyCredential).toBe(verifyCredential);
  });
});
