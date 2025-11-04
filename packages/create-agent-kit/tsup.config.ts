import { definePackageConfig } from "../tsup.config.base";

export default definePackageConfig({
  entry: ["src/index.ts"],
  target: "node18",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
