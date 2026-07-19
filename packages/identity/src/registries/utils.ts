/**
 * Shared utilities for ERC-8004 registry clients
 */

import type { Hex } from '@lucid-agents/wallet';

/**
 * Type for public clients that support waiting for transaction receipts
 */
export type PublicClientWithReceipt = {
  waitForTransactionReceipt?(args: {
    hash: Hex;
    confirmations?: number;
    timeout?: number;
  }): Promise<TransactionReceiptLike>;
  getTransactionReceipt?(args: { hash: Hex }): Promise<TransactionReceiptLike>;
};

/**
 * Type for transaction receipt with logs
 */
export type TransactionReceiptLike = {
  logs?: Array<{
    address: Hex;
    topics: Hex[];
    data: Hex;
  }>;
};

/**
 * Wait for a transaction to be confirmed on-chain.
 * Useful after write operations to ensure data is available for reads.
 *
 * @param publicClient - Public client (may or may not support waitForTransactionReceipt)
 * @param txHash - Transaction hash to wait for
 * @param options - Optional timeout and confirmations settings
 * @returns Transaction receipt if available, undefined otherwise
 */
export async function waitForConfirmation(
  publicClient: PublicClientWithReceipt | any,
  txHash: Hex,
  options?: { timeout?: number; confirmations?: number }
): Promise<TransactionReceiptLike | undefined> {
  const publicClientWithReceipt = publicClient as PublicClientWithReceipt;
  if (publicClientWithReceipt?.waitForTransactionReceipt) {
    const confirmations = options?.confirmations ?? 2;
    return await publicClientWithReceipt.waitForTransactionReceipt({
      hash: txHash,
      confirmations,
    });
  } else if (publicClientWithReceipt?.getTransactionReceipt) {
    await new Promise(resolve => setTimeout(resolve, options?.timeout ?? 5000));
    return await publicClientWithReceipt.getTransactionReceipt({
      hash: txHash,
    });
  } else {
    // If publicClient doesn't support waiting, just wait a fixed time
    const timeout = options?.timeout ?? 5000;
    await new Promise(resolve => setTimeout(resolve, timeout));
    return undefined;
  }
}
