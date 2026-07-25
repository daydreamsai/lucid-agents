import { describe, expect, it } from 'bun:test';
import { createSSEStream, writeSSE } from '../sse';

describe('createSSEStream', () => {
  it('applies consumer backpressure before accepting the next event', async () => {
    let secondAccepted = false;
    const response = createSSEStream(async ctx => {
      await ctx.write({ event: 'message', data: 'first' });
      await ctx.write({ event: 'message', data: 'second' });
      secondAccepted = true;
      await ctx.close();
    });
    const reader = response.body!.getReader();

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(secondAccepted).toBe(false);

    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data: first'
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(secondAccepted).toBe(true);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data: second'
    );
  });

  it('releases every capacity waiter when the consumer pulls', async () => {
    let waitersAreBlocked!: () => void;
    const blocked = new Promise<void>(resolve => {
      waitersAreBlocked = resolve;
    });
    let waitersReleased!: () => void;
    const released = new Promise<void>(resolve => {
      waitersReleased = resolve;
    });
    const response = createSSEStream(async ctx => {
      await ctx.write({ event: 'message', data: 'first' });
      const firstWaiter = ctx.ready();
      const secondWaiter = ctx.ready();
      waitersAreBlocked();
      await Promise.all([firstWaiter, secondWaiter]);
      waitersReleased();
      await ctx.write({ event: 'message', data: 'second' });
      await ctx.close();
    });

    await blocked;
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data: first'
    );

    const outcome = await Promise.race([
      released.then(() => 'released'),
      new Promise<'timed-out'>(resolve => {
        setTimeout(() => resolve('timed-out'), 50);
      }),
    ]);
    expect(outcome).toBe('released');
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data: second'
    );
  });

  it('aborts the runner when the client cancels the response body', async () => {
    let observedAbort = false;
    const response = createSSEStream(async ctx => {
      await ctx.write({ event: 'message', data: 'first' });
      if (ctx.signal.aborted) {
        observedAbort = true;
        return;
      }
      await new Promise<void>(resolve => {
        ctx.signal.addEventListener(
          'abort',
          () => {
            observedAbort = true;
            resolve();
          },
          { once: true }
        );
      });
    });
    const reader = response.body!.getReader();

    await reader.read();
    await new Promise(resolve => setTimeout(resolve, 0));
    await reader.cancel('client disconnected');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(observedAbort).toBe(true);
  });

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
