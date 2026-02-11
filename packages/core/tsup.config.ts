import { definePackageConfig } from '../tsup.config.base';

const entryPoints = {
  index: 'src/index.ts',
  utils: 'src/utils/index.ts',
};

export default definePackageConfig({
  entry: entryPoints,
  dts: {
    entry: entryPoints,
  },
  external: [
    '@lucid-dreams/client',
    '@lucid-agents/types',
    '@lucid-agents/a2a',
    '@lucid-agents/ap2',
    '@lucid-agents/identity',
    '@lucid-agents/payments',
    'hono',
    'viem',
    'x402',
    'x402-fetch',
    'x402-hono',
    'zod',
  ],
});
