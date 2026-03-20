/**
 * Identity Reputation Agent Example — Lucid Agents SDK
 *
 * Bounty Submission for Issue #183
 *
 * Run: bun run packages/examples/src/identity-reputation-agent/index.ts
 */

import { createAgentApp } from '@lucid-agents/hono';
import { createIdentityReputationAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535)
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  const agent = await createIdentityReputationAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  const hr = '─'.repeat(52);
  console.log(`[identity-agent] ${hr}`);
  console.log(`[identity-agent] Server:    ${ORIGIN}`);
  console.log(`[identity-agent] ${hr}`);
  console.log(`[identity-agent] Try it (domain or address):`);
  console.log(`[identity-agent]   curl ${ORIGIN}/entrypoints/reputation/invoke \\`);
  console.log(`[identity-agent]        -H 'Content-Type: application/json' \\`);
  console.log(`[identity-agent]        -d '{"input":{"identity":"my-agent.example.com"}}'`);
  console.log(`[identity-agent] ${hr}`);

  process.on('SIGINT', () => {
    console.log('\n[identity-agent] Shutting down...');
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[identity-agent] Fatal error:', err);
  process.exit(1);
});
