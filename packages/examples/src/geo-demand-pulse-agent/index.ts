/**
 * Geo Demand Pulse Agent Example — Lucid Agents SDK
 *
 * Bounty Submission for Issue #182
 *
 * Run: bun run packages/examples/src/geo-demand-pulse-agent/index.ts
 *
 * Environment variables (all optional — agent starts without them):
 *   AGENT_WALLET_TYPE=local            Wallet type (local | thirdweb | lucid)
 *   AGENT_WALLET_PRIVATE_KEY=0x...     Private key for identity + payments
 *   AGENT_DOMAIN=my-agent.example.com  ERC-8004 domain
 *   AUTO_REGISTER=true                 Auto-register identity on startup
 *   FACILITATOR_URL=...                x402 facilitator (default: daydreams.systems)
 *   PAYMENTS_RECEIVABLE_ADDRESS=0x...  Address to receive payments
 *   NETWORK=base-sepolia               Chain network identifier
 *   PORT=8787                          Server port
 */

import { createAgentApp } from '@lucid-agents/hono';
import { createGeoDemandAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535)
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  const agent = await createGeoDemandAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  const hr = '─'.repeat(52);
  console.log(`[geo-demand-agent] ${hr}`);
  console.log(`[geo-demand-agent] Wallet:    ${agent.wallets ? 'configured' : 'not configured (set AGENT_WALLET_TYPE + AGENT_WALLET_PRIVATE_KEY)'}`);
  console.log(`[geo-demand-agent] Identity:  ${agent.wallets ? 'enabled' : 'disabled (no wallet)'}`);
  console.log(`[geo-demand-agent] Payments:  x402 ready`);
  console.log(`[geo-demand-agent] Analytics: ready`);
  console.log(`[geo-demand-agent] AP2:       roles: merchant`);
  console.log(`[geo-demand-agent] Server:    ${ORIGIN}`);
  console.log(`[geo-demand-agent] ${hr}`);
  console.log(`[geo-demand-agent] Try it (lat/lon for San Francisco):`);
  console.log(`[geo-demand-agent]   curl ${ORIGIN}/entrypoints/pulse/invoke \\`);
  console.log(`[geo-demand-agent]        -H 'Content-Type: application/json' \\`);
  console.log(`[geo-demand-agent]        -d '{"input":{"latitude":37.77,"longitude":-122.41}}'`);
  console.log(`[geo-demand-agent] ${hr}`);

  process.on('SIGINT', () => {
    console.log('\n[geo-demand-agent] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[geo-demand-agent] Fatal error:', err);
  process.exit(1);
});
