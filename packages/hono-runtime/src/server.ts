/**
 * Development server for @lucid-agents/hono-runtime
 *
 * Run with: bun run src/server.ts
 */

// Use simple app to avoid Zod 4 compatibility issues with @hono/zod-openapi
import { createHonoRuntime } from './app-simple';
import { createMemoryAgentStore } from './store/memory';

// Create in-memory store
const store = createMemoryAgentStore();

// Create Hono app
const app = createHonoRuntime({
  store,
  openapi: {
    title: 'Lucid Agents Runtime (Dev)',
    version: '0.1.0',
    description: 'Development server for testing the multi-agent runtime',
  },
});

// Get port from environment or default to 8787
const port = parseInt(process.env.PORT ?? '8787', 10);

console.log('');
console.log('🚀 Lucid Agents Runtime');
console.log('========================');
console.log(`   Server:    http://localhost:${port}`);
console.log(`   Swagger:   http://localhost:${port}/swagger`);
console.log(`   OpenAPI:   http://localhost:${port}/doc`);
console.log('');
console.log('Quick start:');
console.log('  1. Visit /swagger to explore the API');
console.log('  2. POST /api/agents to create an agent');
console.log('  3. POST /agents/{id}/entrypoints/{key}/invoke to invoke');
console.log('');

// Start server
Bun.serve({
  port,
  fetch: app.fetch,
});
