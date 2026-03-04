import { definePackageConfig } from "../tsup.config.base";

export default definePackageConfig({
  entry: {
    index: "src/index.ts",
  },
  dts: {
    entry: {
      index: "src/index.ts",
    },
  },
  external: [
    "@solana/web3.js",
    "@lucid-agents/core",
    "@lucid-agents/types",
  ],
});
