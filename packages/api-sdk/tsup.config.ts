import { definePackageConfig } from '../tsup.config.base';

export default definePackageConfig({
  entry: {
    index: 'src/index.ts',
    'sdk/client/index': 'src/sdk/client/index.ts',
    'sdk/@tanstack/react-query.gen':
      'src/sdk/@tanstack/react-query.gen.ts',
  },
  dts: true,
  external: ['@tanstack/react-query'],
});
