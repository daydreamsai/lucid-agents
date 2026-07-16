import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
    'storage/sqlite': 'src/storage/sqlite.ts',
    'storage/postgres': 'src/storage/postgres.ts',
    'providers/stripe': 'src/providers/stripe.ts',
  },
  dts: {
    entry: {
      index: 'src/index.ts',
      node: 'src/node.ts',
      'storage/sqlite': 'src/storage/sqlite.ts',
      'storage/postgres': 'src/storage/postgres.ts',
      'providers/stripe': 'src/providers/stripe.ts',
    },
  },
  external: [
    '@lucid-agents/core',
    '@lucid-agents/identity',
    '@lucid-agents/wallet',
    '@x402/fetch',
    '@x402/core',
    '@x402/evm',
    '@x402/svm',
    'bun:sqlite',
    'pg',
    'viem',
    'stripe',
    'zod',
  ],
});
