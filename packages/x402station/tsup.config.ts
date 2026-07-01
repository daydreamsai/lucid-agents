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
    "@lucid-agents/payments",
    "@x402/fetch",
    "@x402/evm",
    "@x402/core",
    "viem",
    "zod",
  ],
});
