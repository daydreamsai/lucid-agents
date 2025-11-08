import { definePackageConfig } from "../tsup.config.base";

const entryPoints = {
  index: "src/index.ts",
  agent: "src/agent.ts",
  paywall: "src/paywall.ts",
  types: "src/types.ts"
};

export default definePackageConfig({
  entry: entryPoints,
  dts: {
    entry: entryPoints
  },
  external: ["zod"]
});
