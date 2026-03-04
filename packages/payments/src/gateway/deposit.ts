import type { GatewayDepositOptions, GatewayDepositResult } from './types';

/**
 * Default chain for deposit operations.
 */
const DEFAULT_CHAIN = 'base';

/**
 * Deposit USDC into Circle Gateway for gasless payments.
 *
 * This is a one-time setup step. Once deposited, the buyer can make
 * x402 payments without paying gas fees.
 *
 * @param options - Deposit configuration
 * @returns Deposit result with transaction hashes
 *
 * @example
 * ```typescript
 * import { depositToGateway } from '@lucid-agents/payments';
 *
 * const result = await depositToGateway({
 *   privateKey: '0x...',
 *   amount: '10.00',
 *   chain: 'base',
 * });
 * console.log('Deposited:', result.amount, 'USDC');
 * ```
 */
export async function depositToGateway(
  options: GatewayDepositOptions
): Promise<GatewayDepositResult> {
  const chain = options.chain ?? DEFAULT_CHAIN;

  if (!options.privateKey) {
    throw new Error(
      '[agent-kit-payments:gateway] depositToGateway requires a privateKey'
    );
  }

  const parsedAmount = parseFloat(options.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Error(
      '[agent-kit-payments:gateway] depositToGateway requires a positive numeric amount'
    );
  }

  console.info(
    '[agent-kit-payments:gateway] depositing',
    options.amount,
    'USDC to Gateway on',
    chain
  );

  // Dynamic import to avoid hard failure when optional peer dep is missing
  const { GatewayClient } = await import('@circle-fin/x402-batching/client');

  const client = new GatewayClient({
    chain: chain as import('@circle-fin/x402-batching/client').SupportedChainName,
    privateKey: options.privateKey as `0x${string}`,
  });

  const result = await client.deposit(options.amount);

  console.info(
    '[agent-kit-payments:gateway] deposit complete',
    `tx=${result.depositTxHash}`,
    `amount=${result.formattedAmount}`
  );

  return {
    depositTxHash: result.depositTxHash,
    approvalTxHash: result.approvalTxHash,
    amount: result.formattedAmount,
    depositor: result.depositor,
  };
}
