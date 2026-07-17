/**
 * Kitchen-Sink Example — Lucid Agents SDK
 *
 * Demonstrates: identity · payments · A2A · AP2 · wallet · scheduler · analytics · Hono HTTP
 *
 * Run: bun run packages/examples/src/kitchen-sink/index.ts
 */

import { createAgentApp } from '@lucid-agents/hono';

import { createKitchenSinkAgent } from './agent';
import { createClientAgent, runA2ADemo } from './client';
import { registerEntrypoints } from './entrypoints';

export type StartKitchenSinkOptions = {
  port?: number;
  clientPort?: number;
  runDemo?: boolean;
  quiet?: boolean;
};

export type RunningKitchenSink = {
  origin: string;
  clientOrigin: string;
  close(): Promise<void>;
};

function parsePort(value: string | undefined, fallback: number): number {
  const port = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function printBanner(
  origin: string,
  clientOrigin: string,
  hasWallets: boolean
) {
  const hr = '─'.repeat(52);
  console.log(`[kitchen-sink] ${hr}`);
  console.log(
    `[kitchen-sink] Wallet:    ${hasWallets ? 'configured' : 'not configured (set AGENT_WALLET_TYPE + AGENT_WALLET_PRIVATE_KEY)'}`
  );
  console.log(
    `[kitchen-sink] Identity:  ${hasWallets ? 'enabled' : 'disabled (no wallet)'}`
  );
  console.log(`[kitchen-sink] Payments:  x402 ready`);
  console.log(`[kitchen-sink] Analytics: ready`);
  console.log(`[kitchen-sink] Scheduler: ready`);
  console.log(`[kitchen-sink] A2A:       ready`);
  console.log(`[kitchen-sink] AP2:       roles: merchant`);
  console.log(`[kitchen-sink] Server:    ${origin}`);
  console.log(`[client]       Server:    ${clientOrigin}`);
  console.log(`[kitchen-sink] ${hr}`);
  console.log(`[kitchen-sink] Try it:`);
  console.log(`[kitchen-sink]   curl ${origin}/entrypoints/echo/invoke \\`);
  console.log(`[kitchen-sink]        -H 'Content-Type: application/json' \\`);
  console.log(`[kitchen-sink]        -d '{"input":{"text":"hello"}}'`);
  console.log(
    `[kitchen-sink]   curl ${origin}/.well-known/agent-card.json | jq .`
  );
  console.log(`[kitchen-sink] ${hr}`);
}

/** Start both kitchen-sink agents and return their origins plus a close hook. */
export async function startKitchenSink(
  options: StartKitchenSinkOptions = {}
): Promise<RunningKitchenSink> {
  const port = options.port ?? parsePort(process.env.PORT, 8787);
  const clientPort =
    options.clientPort ?? parsePort(process.env.CLIENT_PORT, 8788);

  const agent = await createKitchenSinkAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch: app.fetch.bind(app),
  });

  const clientAgent = await createClientAgent();
  const { app: clientApp } = await createAgentApp(clientAgent);
  const clientServer = Bun.serve({
    hostname: '127.0.0.1',
    port: clientPort,
    fetch: clientApp.fetch.bind(clientApp),
  });

  if (server.port === undefined || clientServer.port === undefined) {
    server.stop(true);
    clientServer.stop(true);
    await Promise.all([agent.close(), clientAgent.close()]);
    throw new Error('Bun did not bind the kitchen-sink servers');
  }

  const origin = `http://127.0.0.1:${server.port}`;
  const clientOrigin = `http://127.0.0.1:${clientServer.port}`;
  const hasWallets = 'wallets' in agent && Boolean(agent.wallets);

  if (!options.quiet) printBanner(origin, clientOrigin, hasWallets);
  if (options.runDemo !== false) {
    try {
      await runA2ADemo(origin);
    } catch (error) {
      if (!options.quiet) {
        console.warn(
          '[client]       A2A demo skipped:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  let closed = false;
  return {
    origin,
    clientOrigin,
    async close() {
      if (closed) return;
      closed = true;
      server.stop(true);
      clientServer.stop(true);
      await Promise.all([agent.close(), clientAgent.close()]);
    },
  };
}

async function main() {
  const running = await startKitchenSink({
    runDemo: process.env.RUN_A2A_DEMO !== 'false',
    quiet: process.env.QUIET === 'true',
  });
  console.log(`[kitchen-sink] All capabilities running. Press Ctrl+C to stop.`);

  process.once('SIGINT', async () => {
    console.log('\n[kitchen-sink] Shutting down...');
    await running.close();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    await running.close();
    process.exit(0);
  });
}

if (import.meta.main) {
  main().catch(error => {
    console.error('[kitchen-sink] Fatal error:', error);
    process.exit(1);
  });
}
