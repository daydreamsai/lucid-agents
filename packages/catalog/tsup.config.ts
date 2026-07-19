import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: {
    index: 'src/index.ts',
    node: 'src/node.ts',
  },
  dts: true,
  external: [
    '@lucid-agents/types',
    'yaml',
    'csv-parse',
    'csv-parse/browser/esm/sync',
    'zod',
  ],
});
