import { definePackageConfig } from '../tsup.config.base';

const entryPoints = {
  index: 'src/index.ts',
  types: 'src/types.ts',
  utils: 'src/utils/index.ts',
  'utils/axllm': 'src/utils/axllm.ts',
  'utils/x402': 'src/utils/x402.ts',
  erc8004: 'src/erc8004.ts',
};

export default definePackageConfig({
  entry: entryPoints,
  dts: {
    entry: entryPoints,
  },
  external: [
    '@ax-llm/ax',
    '@lucid-dreams/client',
    '@lucid-agents/agent-kit-identity',
    'hono',
    'viem',
    'x402',
    'x402-fetch',
    'x402-hono',
    'zod',
  ],
});
