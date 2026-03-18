import { describe, expect, it } from 'bun:test';
import { createSSEStream, writeSSE } from '../sse';

describe('createSSEStream', () => {
  it('should create a valid Response with SSE headers', () => {
    const response = createSSEStream(ctx => {
      ctx.close();
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe(
      'text/event-stream; charset=utf-8'
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'no-cache, no-transform'
    );
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('should send messages through the stream', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'message', data: 'test message' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const { value, done } = await reader!.read();

    expect(done).toBe(false);
    const text = decoder.decode(value);
    expect(text).toContain('event: message');
    expect(text).toContain('data: test message');

    reader!.releaseLock();
  });

  it('should send multiple messages in sequence', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'msg', data: 'message 1' });
      ctx.write({ event: 'msg', data: 'message 2' });
      ctx.write({ event: 'msg', data: 'message 3' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const messages: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { value } = await reader!.read();
      messages.push(decoder.decode(value));
    }

    expect(messages[0]).toContain('message 1');
    expect(messages[1]).toContain('message 2');
    expect(messages[2]).toContain('message 3');

    reader!.releaseLock();
  });

  it('should handle different event types', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'start', data: 'begin' });
      ctx.write({ event: 'update', data: 'progress' });
      ctx.write({ event: 'end', data: 'complete' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const messages: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { value } = await reader!.read();
      messages.push(decoder.decode(value));
    }

    expect(messages[0]).toContain('event: start');
    expect(messages[1]).toContain('event: update');
    expect(messages[2]).toContain('event: end');

    reader!.releaseLock();
  });

  it('should handle messages with IDs for reconnection', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'msg', id: '1', data: 'first' });
      ctx.write({ event: 'msg', id: '2', data: 'second' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const msg1 = await reader!.read();
    const msg2 = await reader!.read();

    expect(decoder.decode(msg1.value)).toContain('id: 1');
    expect(decoder.decode(msg2.value)).toContain('id: 2');

    reader!.releaseLock();
  });

  it('should handle async runner function', async () => {
    const response = createSSEStream(async ctx => {
      ctx.write({ event: 'test', data: 'async message' });
      await new Promise(resolve => setTimeout(resolve, 1));
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain('async message');
    reader!.releaseLock();
  });

  it('should handle multiline data correctly', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'multiline', data: 'line1\nline2\nline3' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    // Each line should be prefixed with "data: "
    expect(text).toContain('data: line1');
    expect(text).toContain('data: line2');
    expect(text).toContain('data: line3');

    reader!.releaseLock();
  });

  it('should handle JSON data', async () => {
    const jsonData = JSON.stringify({ message: 'hello', count: 42 });
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'json', data: jsonData });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain(jsonData);
    reader!.releaseLock();
  });

  it('should handle empty data correctly', async () => {
    const response = createSSEStream(ctx => {
      ctx.write({ event: 'empty', data: '' });
      ctx.close();
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader!.read();
    const text = decoder.decode(value);

    expect(text).toContain('event: empty');
    expect(text).toContain('data:');

    reader!.releaseLock();
  });
});

describe('writeSSE', () => {
  it('should write formatted SSE message to controller', () => {
    let enqueuedData: Uint8Array | null = null;

    const mockController = {
      enqueue: (data: Uint8Array) => {
        enqueuedData = data;
      },
    } as ReadableStreamDefaultController<Uint8Array>;

    writeSSE(mockController, { event: 'test', data: 'hello' });

    expect(enqueuedData).toBeDefined();
    const text = new TextDecoder().decode(enqueuedData!);
    expect(text).toContain('event: test');
    expect(text).toContain('data: hello');
  });
});
