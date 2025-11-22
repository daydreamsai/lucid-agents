import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: [
    '@lucid-agents/core',
    '@lucid-agents/types',
    '@lucid-agents/payments',
    'hono',
  ],
});

