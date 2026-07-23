const encoder = new TextEncoder();

export type SSEWriteOptions = {
  event: string;
  data: string;
  id?: string;
};

export type SSEStreamRunnerContext = {
  /** Wait until the consumer can accept another event. */
  ready: () => Promise<void>;
  write: (options: SSEWriteOptions) => Promise<void>;
  close: () => Promise<void>;
  /** Aborted when the HTTP request aborts or the response reader cancels. */
  signal: AbortSignal;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type SSEStreamRunner = (
  ctx: SSEStreamRunnerContext
) => Promise<void> | void;

export type SSEStreamOptions = {
  signal?: AbortSignal;
};

const toDataLines = (value: string): string[] => {
  return value.split(/\r?\n/).map(line => line || '');
};

const buildSSEChunk = ({ event, data, id }: SSEWriteOptions): string => {
  const lines: string[] = [];
  if (id) {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${event}`);
  for (const datum of toDataLines(data)) {
    lines.push(`data: ${datum}`);
  }
  lines.push('');
  return lines.join('\n');
};

export const writeSSE = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  options: SSEWriteOptions
) => {
  controller.enqueue(encoder.encode(`${buildSSEChunk(options)}\n`));
};

function abortedError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The SSE stream was aborted.', 'AbortError');
}

export const createSSEStream = (
  runner: SSEStreamRunner,
  options?: SSEStreamOptions
): Response => {
  const lifecycle = new AbortController();
  const capacityWaiters = new Set<() => void>();
  const notifyCapacityWaiters = (): void => {
    const waiters = [...capacityWaiters];
    capacityWaiters.clear();
    for (const notify of waiters) {
      notify();
    }
  };
  if (options?.signal) {
    if (options.signal.aborted) {
      lifecycle.abort(options.signal.reason);
    } else {
      options.signal.addEventListener(
        'abort',
        () => lifecycle.abort(options.signal!.reason),
        { once: true }
      );
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending = Promise.resolve();
      const ready = async (): Promise<void> => {
        while (!lifecycle.signal.aborted && controller.desiredSize !== null) {
          if ((controller.desiredSize ?? 0) > 0) return;
          await new Promise<void>(resolve => {
            const finish = () => {
              lifecycle.signal.removeEventListener('abort', finish);
              capacityWaiters.delete(finish);
              resolve();
            };
            capacityWaiters.add(finish);
            lifecycle.signal.addEventListener('abort', finish, { once: true });
          });
        }
        throw abortedError(lifecycle.signal);
      };
      const context: SSEStreamRunnerContext = {
        controller,
        ready,
        signal: lifecycle.signal,
        write: writeOptions => {
          const operation = pending.then(async () => {
            try {
              await ready();
            } catch (error) {
              if (lifecycle.signal.aborted) return;
              throw error;
            }
            if (closed) throw new Error('SSE stream is closed');
            writeSSE(controller, writeOptions);
          });
          pending = operation;
          return operation;
        },
        close: () => {
          const operation = pending.then(() => {
            if (closed || lifecycle.signal.aborted) return;
            closed = true;
            controller.close();
          });
          pending = operation;
          return operation;
        },
      };
      Promise.resolve(runner(context)).catch(error => {
        if (lifecycle.signal.aborted || closed) return;
        closed = true;
        controller.error(error);
      });
    },
    pull() {
      notifyCapacityWaiters();
    },
    cancel(reason) {
      lifecycle.abort(reason);
      notifyCapacityWaiters();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
};
