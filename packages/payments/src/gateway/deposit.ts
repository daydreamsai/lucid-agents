import { createRequire } from 'node:module';
import type { CircleGatewayClientDeps, GatewayDepositOptions } from './types';

const CIRCLE_GATEWAY_MISSING_DEP_ERROR =
  '[agent-kit-payments] Circle Gateway support requires optional peer dependency @circle-fin/x402-batching';

const requireModule = createRequire(import.meta.url);

const GATEWAY_CHAIN_ALIASES = {
  arcTestnet: 'arcTestnet',
  base: 'base',
  baseSepolia: 'baseSepolia',
  'base-sepolia': 'baseSepolia',
} as const;

type NormalizedGatewayChain = 'arcTestnet' | 'base' | 'baseSepolia';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeGatewayChain(
  chain?: GatewayDepositOptions['chain']
): NormalizedGatewayChain {
  if (!chain) {
    return 'base';
  }

  const normalized = GATEWAY_CHAIN_ALIASES[chain];
  if (!normalized) {
    throw new Error(
      `[agent-kit-payments] Unsupported Circle Gateway chain: ${chain}`
    );
  }

  return normalized;
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

export async function depositToGateway(
  amount: string,
  options: GatewayDepositOptions,
  depsArg?: CircleGatewayClientDeps
): Promise<unknown> {
  if (!amount || amount.trim().length === 0) {
    throw new Error(
      '[agent-kit-payments] depositToGateway requires a non-empty amount'
    );
  }

  if (!options.privateKey || options.privateKey.trim().length === 0) {
    throw new Error(
      '[agent-kit-payments] depositToGateway requires a non-empty privateKey'
    );
  }

  const deps = depsArg ?? loadCircleGatewayClientDeps();
  const chain = normalizeGatewayChain(options.chain);

  const gatewayClient = new deps.GatewayClient({
    chain,
    privateKey: options.privateKey,
    ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
  });

  if (typeof gatewayClient.deposit !== 'function') {
    throw new Error(
      '[agent-kit-payments] GatewayClient does not expose deposit()'
    );
  }

  return gatewayClient.deposit(amount, {
    ...(options.approveAmount ? { approveAmount: options.approveAmount } : {}),
    ...(typeof options.skipApprovalCheck === 'boolean'
      ? { skipApprovalCheck: options.skipApprovalCheck }
      : {}),
  });
}
