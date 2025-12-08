import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts', 'src/core/index.ts', 'src/a2a/index.ts', 'src/analytics/index.ts', 'src/ap2/index.ts', 'src/http/index.ts', 'src/identity/index.ts', 'src/payments/index.ts', 'src/scheduler/index.ts', 'src/wallets/index.ts'],
  dts: {
    entry: ['src/index.ts', 'src/core/index.ts', 'src/a2a/index.ts', 'src/analytics/index.ts', 'src/ap2/index.ts', 'src/http/index.ts', 'src/identity/index.ts', 'src/payments/index.ts', 'src/scheduler/index.ts', 'src/wallets/index.ts'],
  },
  external: ['zod', 'x402'],
});
