import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: ['src/index.ts'],
  dts: true,
  external: ['@lucid-agents/types', '@zkp2p/cash', 'viem'],
});
