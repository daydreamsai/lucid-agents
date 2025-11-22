const encoder = new TextEncoder();

export type SSEWriteOptions = {
  event: string;
  data: string;
  id?: string;
};

export type SSEStreamRunnerContext = {
  write: (options: SSEWriteOptions) => void;
  close: () => void;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export type SSEStreamRunner = (
  ctx: SSEStreamRunnerContext
) => Promise<void> | void;

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

export const createSSEStream = (runner: SSEStreamRunner): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const context: SSEStreamRunnerContext = {
        controller,
        close: () => controller.close(),
        write: options => writeSSE(controller, options),
      };
      Promise.resolve(runner(context)).catch(error => {
        controller.error(error);
      });
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

