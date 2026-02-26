import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/schemas.ts', 'src/liquidity-service.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
