import type { Options } from "tsup";
import { defineConfig } from "tsup";

const baseOptions: Partial<Options> = {
  format: ["esm"],
  sourcemap: true,
  clean: true,
  target: "es2020",
  treeshake: true,
  splitting: false,
  skipNodeModulesBundle: true,
  outDir: "dist",
};

function withDefaults(option: Options): Options {
  return {
    ...baseOptions,
    tsconfig: option.tsconfig ?? "./tsconfig.build.json",
    dts: option.dts ?? true,
    ...option,
  };
}

export function definePackageConfig(options: Options | Options[]) {
  if (Array.isArray(options)) {
    return defineConfig(options.map(withDefaults));
  }

  return defineConfig(withDefaults(options));
}
