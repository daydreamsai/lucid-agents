import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: [
    '@lucid-agents/agent-kit',
    '@lucid-agents/agent-kit-identity',
    '@lucid-dreams/agent-auth',
    'x402-fetch',
    'x402',
    'viem',
    'zod',
  ],
});

