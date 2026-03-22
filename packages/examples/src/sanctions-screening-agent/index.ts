/**
 * Sanctions Screening Agent Example — Lucid Agents SDK
 *
 * Bounty Submission for Issue #185
 *
 * Run: bun run packages/examples/src/sanctions-screening-agent/index.ts
 */

import { createAgentApp } from '@lucid-agents/hono';
import { createSanctionsScreeningAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535)
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  const agent = await createSanctionsScreeningAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  const hr = '─'.repeat(52);
  console.log(`[sanctions-agent] ${hr}`);
  console.log(`[sanctions-agent] Server:    ${ORIGIN}`);
  console.log(`[sanctions-agent] ${hr}`);
  console.log(`[sanctions-agent] Try it:`);
  console.log(`[sanctions-agent]   curl ${ORIGIN}/entrypoints/screen/invoke \\`);
  console.log(`[sanctions-agent]        -H 'Content-Type: application/json' \\`);
  console.log(`[sanctions-agent]        -d '{"input":{"name":"John Doe"}}'`);
  console.log(`[sanctions-agent] ${hr}`);

  process.on('SIGINT', () => {
    console.log('\n[sanctions-agent] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[sanctions-agent] Fatal error:', err);
  process.exit(1);
});
