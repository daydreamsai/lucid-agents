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
    'zod',
  ],
});
