/**
 * Geo Demand Pulse Index - Main Entry Point
 */
import { createAgentApp } from '@lucid-agents/hono';

import { createGeoDemandAgent } from './agent';
import { registerEntrypoints } from './entrypoints';

export { createGeoDemandAgent } from './agent';
export * from './data-provider';
export { registerEntrypoints } from './entrypoints';
export * from './handlers';
export * from './schemas';
export * from './transforms';

async function main() {
  const agent = await createGeoDemandAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);

  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ port, fetch: app.fetch });

  console.log(`🌍 Geo Demand Pulse Index API ready at http://${server.hostname}:${server.port}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST /entrypoints/demand-index/invoke`);
  console.log(`  POST /entrypoints/demand-trend/invoke`);
  console.log(`  POST /entrypoints/demand-anomalies/invoke`);
  console.log('');
  console.log('Discovery:');
  console.log(`  GET /.well-known/agent-card.json`);
}

if (import.meta.main) {
  main().catch(console.error);
}
