import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/cli.ts'],
  target: 'node20',
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
