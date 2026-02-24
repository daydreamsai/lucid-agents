import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: [
    '@lucid-agents/types',
    '@lucid-agents/a2a',
    'zod',
  ],
});
