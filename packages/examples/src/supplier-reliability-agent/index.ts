/**
 * Supplier Reliability Agent Example — Lucid Agents SDK
 *
 * Bounty Submission for Issue #181
 *
 * Run: bun run packages/examples/src/supplier-reliability-agent/index.ts
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
import { createSupplierReliabilityAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535)
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  const agent = await createSupplierReliabilityAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  const hr = '─'.repeat(52);
  console.log(`[supplier-agent] ${hr}`);
  console.log(`[supplier-agent] Wallet:    ${agent.wallets ? 'configured' : 'not configured (set AGENT_WALLET_TYPE + AGENT_WALLET_PRIVATE_KEY)'}`);
  console.log(`[supplier-agent] Identity:  ${agent.wallets ? 'enabled' : 'disabled (no wallet)'}`);
  console.log(`[supplier-agent] Payments:  x402 ready`);
  console.log(`[supplier-agent] Analytics: ready`);
  console.log(`[supplier-agent] AP2:       roles: merchant`);
  console.log(`[supplier-agent] Server:    ${ORIGIN}`);
  console.log(`[supplier-agent] ${hr}`);
  console.log(`[supplier-agent] Try it (replace 'acme-corp' with any ID):`);
  console.log(`[supplier-agent]   curl ${ORIGIN}/entrypoints/score/invoke \\`);
  console.log(`[supplier-agent]        -H 'Content-Type: application/json' \\`);
  console.log(`[supplier-agent]        -d '{"input":{"supplierId":"acme-corp"}}'`);
  console.log(`[supplier-agent] ${hr}`);

  process.on('SIGINT', () => {
    console.log('\n[supplier-agent] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[supplier-agent] Fatal error:', err);
  process.exit(1);
});
