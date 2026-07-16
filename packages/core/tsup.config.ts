import { definePackageConfig } from '../tsup.config.base';

const entryPoints = {
  index: 'src/index.ts',
  utils: 'src/utils/index.ts',
};

export default definePackageConfig({
  entry: entryPoints,
  dts: {
    entry: entryPoints,
  },
  external: [
    '@lucid-agents/types',
    'zod',
  ],
});
