import { describe, expect, it } from 'bun:test';

import { xmptEnvelopeSchema, xmptReplySchema } from '../schema';

describe('XMPT envelope schema', () => {
  it('accepts valid envelopes', () => {
    const parsed = xmptEnvelopeSchema.parse({
      id: 'msg_1',
      threadId: 'thread_1',
      from: 'agent-a@agentmail.to',
      to: 'agent-b@agentmail.to',
      transport: 'agentmail',
      createdAt: new Date().toISOString(),
      payload: { text: 'hello' },
    });

    expect(parsed.threadId).toBe('thread_1');
    expect(parsed.payload).toEqual({ text: 'hello' });
  });

  it('rejects envelopes without a thread id', () => {
    const result = xmptEnvelopeSchema.safeParse({
      id: 'msg_1',
      threadId: '',
      from: 'agent-a',
      to: 'agent-b',
      transport: 'local',
      createdAt: new Date().toISOString(),
      payload: {},
    });

    expect(result.success).toBe(false);
  });
});

describe('XMPT reply schema', () => {
  it('requires thread id and payload', () => {
    const result = xmptReplySchema.safeParse({
      threadId: 'thread_1',
      payload: { ok: true },
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty thread ids', () => {
    const result = xmptReplySchema.safeParse({
      threadId: '',
      payload: { ok: true },
    });

    expect(result.success).toBe(false);
  });
});
