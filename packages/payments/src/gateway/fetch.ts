import { toClientEvmSigner } from '@x402/evm';
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { createRequire } from 'node:module';
import { privateKeyToAccount } from 'viem/accounts';
import type { CircleGatewayClientDeps, GatewayFetchOptions } from './types';

const CIRCLE_GATEWAY_MISSING_DEP_ERROR =
  '[agent-kit-payments] Circle Gateway support requires optional peer dependency @circle-fin/x402-batching';

const requireModule = createRequire(import.meta.url);

const GATEWAY_CHAIN_NETWORKS = {
  arcTestnet: {
    gatewayChain: 'arcTestnet',
    network: 'eip155:5042002',
  },
  base: {
    gatewayChain: 'base',
    network: 'eip155:8453',
  },
  baseSepolia: {
    gatewayChain: 'baseSepolia',
    network: 'eip155:84532',
  },
} as const;

type NormalizedGatewayChain = keyof typeof GATEWAY_CHAIN_NETWORKS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeGatewayChain(
  chain?: GatewayFetchOptions['chain']
): NormalizedGatewayChain {
  if (!chain) {
    return 'base';
  }

  if (chain === 'base-sepolia') {
    return 'baseSepolia';
  }

  if (chain in GATEWAY_CHAIN_NETWORKS) {
    return chain as NormalizedGatewayChain;
  }

  throw new Error(
    `[agent-kit-payments] Unsupported Circle Gateway chain: ${chain}`
  );
}

function loadCircleGatewayClientDeps(): CircleGatewayClientDeps {
  try {
    const clientModule = requireModule('@circle-fin/x402-batching/client');

    if (
      !isRecord(clientModule) ||
      typeof clientModule.BatchEvmScheme !== 'function' ||
      typeof clientModule.GatewayClient !== 'function'
    ) {
      throw new Error(
        '[agent-kit-payments] Invalid @circle-fin/x402-batching/client exports'
      );
    }

    return {
      BatchEvmScheme:
        clientModule.BatchEvmScheme as CircleGatewayClientDeps['BatchEvmScheme'],
      GatewayClient:
        clientModule.GatewayClient as CircleGatewayClientDeps['GatewayClient'],
    };
  } catch (error) {
    throw new Error(CIRCLE_GATEWAY_MISSING_DEP_ERROR, { cause: error });
  }
}

export function createGatewayFetch(
  options: GatewayFetchOptions,
  depsArg?: CircleGatewayClientDeps
): typeof fetch & { preconnect: () => Promise<void> } {
  if (!options.privateKey || options.privateKey.trim().length === 0) {
    throw new Error(
      '[agent-kit-payments] createGatewayFetch requires a non-empty privateKey'
    );
  }

  const deps = depsArg ?? loadCircleGatewayClientDeps();
  const chain = normalizeGatewayChain(options.chain);
  const network = GATEWAY_CHAIN_NETWORKS[chain].network;
  const gatewayChain = GATEWAY_CHAIN_NETWORKS[chain].gatewayChain;

  const account = privateKeyToAccount(options.privateKey);
  const signer = toClientEvmSigner(account);
  const client = new x402Client();
  client.register(
    network as `${string}:${string}`,
    new deps.BatchEvmScheme(signer)
  );

  const gatewayClient = new deps.GatewayClient({
    chain: gatewayChain,
    privateKey: options.privateKey,
    ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
  });

  const paymentFetch = wrapFetchWithPayment(options.fetchImpl ?? fetch, client);

  const wrappedFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => paymentFetch(input, init ?? {}),
    {
      preconnect: async () => {
        await gatewayClient.getBalances();
      },
    }
  );

  return wrappedFetch;
}
