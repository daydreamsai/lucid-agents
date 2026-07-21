import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts', 'src/service-ui/index.ts'],
  dts: true,
  external: [
    '@lucid-agents/types',
    'hono',
  ],
});
