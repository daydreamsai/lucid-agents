/**
 * Kitchen-Sink Example — Lucid Agents SDK
 *
 * Demonstrates: identity · payments · A2A · AP2 · wallet · scheduler · analytics · Hono HTTP
 *
 * Run: bun run packages/examples/src/kitchen-sink/index.ts
 *
 * Environment variables (all optional — agent starts without them):
 *   AGENT_WALLET_TYPE=local            Wallet type (local | thirdweb | lucid)
 *   AGENT_WALLET_PRIVATE_KEY=0x...     Private key for identity + payments
 *   AGENT_DOMAIN=my-agent.example.com  ERC-8004 domain
 *   AUTO_REGISTER=true                 Auto-register identity on startup
 *   FACILITATOR_URL=...                x402 facilitator (default: daydreams.systems)
 *   PAYMENTS_RECEIVABLE_ADDRESS=0x...  Address to receive payments
 *   NETWORK=base-sepolia               Chain network identifier
 *   PORT=8787                          Kitchen-sink server port
 *   CLIENT_PORT=8788                   Client agent port
 */

import { createAgentApp } from '@lucid-agents/hono';

import { createKitchenSinkAgent } from './agent';
import { createClientAgent, runA2ADemo } from './client';
import { registerEntrypoints } from './entrypoints';

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 8788);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  // ── 1. Kitchen-sink agent ──────────────────────────────────────────────────
  const agent = await createKitchenSinkAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  // ── 2. Startup banner ─────────────────────────────────────────────────────
  const hr = '─'.repeat(52);
  console.log(`[kitchen-sink] ${hr}`);
  console.log(
    `[kitchen-sink] Wallet:    ${agent.wallets ? 'configured' : 'not configured (set AGENT_WALLET_TYPE + AGENT_WALLET_PRIVATE_KEY)'}`
  );
  console.log(
    `[kitchen-sink] Identity:  ${agent.wallets ? 'enabled' : 'disabled (no wallet)'}`
  );
  console.log(`[kitchen-sink] Payments:  x402 ready`);
  console.log(`[kitchen-sink] Analytics: ready`);
  console.log(`[kitchen-sink] Scheduler: ready`);
  console.log(`[kitchen-sink] A2A:       ready`);
  console.log(`[kitchen-sink] AP2:       roles: merchant`);
  console.log(`[kitchen-sink] Server:    ${ORIGIN}`);
  console.log(`[kitchen-sink] ${hr}`);
  console.log(`[kitchen-sink] Try it:`);
  console.log(`[kitchen-sink]   curl ${ORIGIN}/entrypoints/echo/invoke \\`);
  console.log(`[kitchen-sink]        -H 'Content-Type: application/json' \\`);
  console.log(`[kitchen-sink]        -d '{"input":{"text":"hello"}}'`);
  console.log(
    `[kitchen-sink]   curl ${ORIGIN}/.well-known/agent-card.json | jq .`
  );
  console.log(`[kitchen-sink] ${hr}`);

  // ── 3. Client agent ────────────────────────────────────────────────────────
  const clientAgent = await createClientAgent();
  const { app: clientApp } = await createAgentApp(clientAgent);
  Bun.serve({ port: CLIENT_PORT, fetch: clientApp.fetch.bind(clientApp) });
  console.log(`[client]       Server:    http://localhost:${CLIENT_PORT}`);

  // Give the kitchen-sink server a moment before the demo call
  await new Promise(resolve => setTimeout(resolve, 200));

  // ── 4. A2A demo ────────────────────────────────────────────────────────────
  try {
    await runA2ADemo(ORIGIN);
  } catch (err) {
    console.warn(
      '[client]       A2A demo skipped:',
      err instanceof Error ? err.message : String(err)
    );
  }

  console.log(`[kitchen-sink] ${hr}`);
  console.log(`[kitchen-sink] All capabilities running. Press Ctrl+C to stop.`);

  process.on('SIGINT', () => {
    console.log('\n[kitchen-sink] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[kitchen-sink] Fatal error:', err);
  process.exit(1);
});
