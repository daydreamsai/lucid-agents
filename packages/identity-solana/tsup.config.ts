import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  external: [
    '@lucid-agents/types',
    '@solana/web3.js',
  ],
});
