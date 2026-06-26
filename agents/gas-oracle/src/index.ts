import { createGasOracleApp } from './agent.js';

const app = createGasOracleApp();
const port = Number(process.env.PORT ?? 3000);

if (typeof Bun !== 'undefined') {
  Bun.serve({ port, fetch: app.fetch });
  console.log(`[gas-oracle] Listening on http://localhost:${port}`);
} else {
  console.log('[gas-oracle] Bun runtime not detected; export `app` for use in tests or other runtimes.');
}

export { app };
export { createGasOracleApp } from './agent.js';
export * from './schemas/index.js';
