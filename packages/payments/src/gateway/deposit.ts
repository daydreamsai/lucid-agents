import type { GatewayDepositOptions, GatewayDepositResult } from './types';
import { GatewayClient } from '@circle-fin/x402-batching/client';

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

  if (!options.amount || parseFloat(options.amount) <= 0) {
    throw new Error(
      '[agent-kit-payments:gateway] depositToGateway requires a positive amount'
    );
  }

  console.info(
    '[agent-kit-payments:gateway] depositing',
    options.amount,
    'USDC to Gateway on',
    chain
  );

  const client = new GatewayClient({
    chain: chain as any,
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
