/**
 * Circle Gateway deposit helper for @lucid-agents/payments.
 *
 * Deposits USDC into Circle Gateway so buyers can make gasless payments.
 *
 * @see https://developers.circle.com/gateway/nanopayments
 */

import type { CircleGatewayChain, GatewayDepositResult } from './types';

type DepositOptions = {
  approveAmount?: string;
  skipApprovalCheck?: boolean;
};

type GatewayClientInstance = {
  deposit(amount: string, options?: DepositOptions): Promise<GatewayDepositResult>;
};

type GatewayClientCtor = new (config: { chain: string; privateKey: string }) => GatewayClientInstance;

function loadGatewayClient(): GatewayClientCtor {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@circle-fin/x402-batching/client') as { GatewayClient: GatewayClientCtor };
    return mod.GatewayClient;
  } catch {
    throw new Error(
      '[lucid-agents/payments] depositToGateway requires @circle-fin/x402-batching. ' +
        'Install it: npm install @circle-fin/x402-batching'
    );
  }
}

/**
 * Deposit USDC into Circle Gateway for gasless x402 payments.
 *
 * After depositing, buyers can pay for x402-protected resources without
 * spending any ETH/MATIC for gas — Circle covers gas fees.
 *
 * @param amount - Amount to deposit as a decimal string (e.g., "10.5" for $10.50)
 * @param chain - Chain to deposit on
 * @param privateKey - Private key (0x-prefixed hex) of the depositing wallet
 * @param options - Optional deposit configuration
 * @param deps - Optional dependency injection (primarily for testing)
 * @returns Deposit result including transaction hashes and deposited amount
 *
 * @example
 * ```typescript
 * import { depositToGateway } from '@lucid-agents/payments';
 *
 * // Deposit $50 USDC into Circle Gateway on Base
 * const result = await depositToGateway('50', 'base', process.env.PRIVATE_KEY as `0x${string}`);
 * console.log('Deposited', result.formattedAmount, 'USDC, tx:', result.depositTxHash);
 * ```
 */
export async function depositToGateway(
  amount: string,
  chain: CircleGatewayChain,
  privateKey: `0x${string}`,
  options?: DepositOptions,
  deps?: { GatewayClient?: GatewayClientCtor }
): Promise<GatewayDepositResult> {
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw new Error('[lucid-agents/payments] depositToGateway requires a positive amount');
  }
  if (!chain) {
    throw new Error('[lucid-agents/payments] depositToGateway requires a chain');
  }
  if (!privateKey) {
    throw new Error('[lucid-agents/payments] depositToGateway requires a privateKey');
  }

  const GatewayClientCtor = deps?.GatewayClient ?? loadGatewayClient();
  const client = new GatewayClientCtor({ chain, privateKey });

  console.info(
    '[lucid-agents/payments:gateway] depositing',
    amount,
    'USDC to Circle Gateway on',
    chain
  );

  const result = await client.deposit(amount, options);

  console.info(
    '[lucid-agents/payments:gateway] deposited',
    result.formattedAmount,
    'USDC, tx:',
    result.depositTxHash
  );

  return result;
}
