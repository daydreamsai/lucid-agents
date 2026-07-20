import { describe, expect, it } from 'bun:test';

import {
  createInvocationState,
  invocationReducer,
  redactInvocationError,
} from '../adapters/ui/src/lib/invocation-state';

describe('generated service UI invocation lifecycle', () => {
  it('describes protected streaming work from preparation through success', () => {
    let state = createInvocationState('{"input":{"topic":"agents"}}');

    state = invocationReducer(state, { type: 'PREPARE' });
    expect(state.phase).toBe('preparing');
    state = invocationReducer(state, { type: 'REQUIRE_AUTHORIZATION' });
    expect(state.phase).toBe('authorization');
    state = invocationReducer(state, { type: 'REQUIRE_PAYMENT' });
    expect(state.phase).toBe('payment');
    state = invocationReducer(state, { type: 'START' });
    expect(state.phase).toBe('running');
    state = invocationReducer(state, { type: 'CHUNK', chunk: 'First result' });
    expect(state).toMatchObject({
      phase: 'partial',
      stream: ['First result'],
    });
    state = invocationReducer(state, {
      type: 'SUCCEED',
      result: { answer: 'Complete' },
      paymentUsed: true,
    });
    expect(state).toMatchObject({
      phase: 'success',
      result: { answer: 'Complete' },
      paymentUsed: true,
    });
  });

  it('tracks task progress, cancellation, validation, and recoverable failures', () => {
    const ready = createInvocationState('{}');
    const invalid = invocationReducer(ready, {
      type: 'INVALID',
      error: 'Payload must be valid JSON',
    });
    expect(invalid.phase).toBe('invalid');

    const task = invocationReducer(ready, {
      type: 'TASK',
      taskId: 'task-42',
      status: 'running',
    });
    expect(task).toMatchObject({
      phase: 'running',
      taskId: 'task-42',
      taskStatus: 'running',
    });
    expect(invocationReducer(task, { type: 'CANCEL' }).phase).toBe('cancelled');
    expect(
      invocationReducer(ready, {
        type: 'NETWORK_MISMATCH',
        error: 'Switch to Base',
      }).phase
    ).toBe('network-mismatch');
    expect(
      invocationReducer(ready, {
        type: 'FAIL',
        error: 'Temporary upstream error',
      }).phase
    ).toBe('recoverable-error');
  });

  it('redacts credentials and signatures before showing an error', () => {
    expect(
      redactInvocationError(
        'Authorization: Bearer secret-value signature=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    ).toBe('Authorization: [redacted] signature=[redacted]');
  });
});
