import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: {
    index: 'src/index.ts',
    conformance: 'src/conformance.ts',
    'storage/sqlite': 'src/storage/sqlite.ts',
    'storage/postgres': 'src/storage/postgres.ts',
  },
  dts: {
    entry: {
      index: 'src/index.ts',
      conformance: 'src/conformance.ts',
      'storage/sqlite': 'src/storage/sqlite.ts',
      'storage/postgres': 'src/storage/postgres.ts',
    },
  },
  external: [
    '@lucid-agents/core',
    '@lucid-agents/types',
    'bun:sqlite',
    'mppx',
    'pg',
    'viem',
  ],
});
