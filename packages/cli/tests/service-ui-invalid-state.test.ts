import { describe, expect, it } from 'bun:test';

import {
  createInvocationState,
  invocationReducer,
} from '../adapters/ui/src/lib/invocation-state';

describe('generated service UI invalid-input regression', () => {
  it('clears a completed stream before showing a later JSON validation error', () => {
    const payload = '{"input":{"prompt":"hello"}}';
    let state = createInvocationState(payload);

    state = invocationReducer(state, { type: 'START' });
    state = invocationReducer(state, { type: 'CHUNK', chunk: 'hello' });
    state = invocationReducer(state, {
      type: 'SUCCEED',
      result: { text: 'hello' },
      paymentUsed: true,
    });
    state = invocationReducer(state, {
      type: 'INVALID',
      error: 'Payload must be valid JSON.',
    });

    expect(state).toEqual({
      phase: 'invalid',
      payload,
      stream: [],
      error: 'Payload must be valid JSON.',
      paymentUsed: false,
    });
  });
});
