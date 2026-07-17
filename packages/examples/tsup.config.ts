import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/**/*.ts', '!src/**/__tests__/**', '!src/**/*.test.ts'],
  dts: false, // Examples don't need type definitions
  format: ['esm'],
  target: 'es2022', // Examples use top-level await
});
