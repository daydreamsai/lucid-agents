import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: [
    '@lucid-agents/core',
    '@lucid-agents/identity',
    '@lucid-agents/wallet',
    'x402-fetch',
    'x402',
    'viem',
    'stripe',
    'zod',
    '@circle-fin/x402-batching',
    '@circle-fin/x402-batching/client',
    '@circle-fin/x402-batching/server',
  ],
});
