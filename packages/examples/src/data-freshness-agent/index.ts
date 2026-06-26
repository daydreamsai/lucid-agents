/**
 * Data Freshness Agent Example — Lucid Agents SDK
 *
 * Bounty Submission for Issue #184
 *
 * Run: bun run packages/examples/src/data-freshness-agent/index.ts
 */

import { createAgentApp } from '@lucid-agents/hono';
import { createDataFreshnessAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535)
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  const agent = await createDataFreshnessAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  const hr = '─'.repeat(52);
  console.log(`[freshness-agent] ${hr}`);
  console.log(`[freshness-agent] Server:    ${ORIGIN}`);
  console.log(`[freshness-agent] ${hr}`);
  console.log(`[freshness-agent] Try it (URL-encoded):`);
  console.log(`[freshness-agent]   curl ${ORIGIN}/entrypoints/freshness/invoke \\`);
  console.log(`[freshness-agent]        -H 'Content-Type: application/json' \\`);
  console.log(`[freshness-agent]        -d '{"input":{"url":"https://daydreams.ai"}}'`);
  console.log(`[freshness-agent] ${hr}`);

  process.on('SIGINT', () => {
    console.log('\n[freshness-agent] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[freshness-agent] Fatal error:', err);
  process.exit(1);
});
