import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  tsconfig: "./tsconfig.build.json",
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@lucid-agents/types',
    'express',
  ],
});
