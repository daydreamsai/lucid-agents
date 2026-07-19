const port = Number.parseInt(process.env.PORT ?? '', 10);
const healthStatus = Number.parseInt(process.env.HEALTH_STATUS ?? '200', 10);

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(request) {
    if (new URL(request.url).pathname === '/health') {
      return Response.json(
        { ok: healthStatus === 200 },
        { status: healthStatus }
      );
    }
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`listening:${server.port}`);

const stop = () => {
  server.stop(true);
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

export {};
