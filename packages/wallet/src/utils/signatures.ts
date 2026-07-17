/**
 * Signature helpers using Viem's standard methods.
 * Supports EIP-191 (personal_sign) and EIP-712 (typed data) signing.
 */

import type { Account, WalletClient } from 'viem';
import { signMessage, signTypedData } from 'viem/actions';

import type { Hex } from './types';

/**
 * Viem WalletClient type for signature operations
 * Accepts any WalletClient with an account
 */
export type SignerWalletClient = WalletClient & { account: Account };

/**
 * Sign a message using EIP-191 (personal_sign)
 * This is the standard way to sign plain text messages or hashes
 * Supports both string messages and Hex (bytes32) hashes
 */
export async function signMessageWithViem(
  walletClient: SignerWalletClient,
  message: string | Hex
): Promise<Hex> {
  // Call the account's signMessage directly if it's available
  // This works better with custom account wrappers
  if (
    walletClient.account &&
    typeof walletClient.account.signMessage === 'function'
  ) {
    return await walletClient.account.signMessage({ message });
  }

  // Fallback to viem's signMessage action (handles both string and Hex)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return signMessage(walletClient as any, {
    account: walletClient.account,
    message,
  });
}

/**
 * Sign typed data using EIP-712
 * More structured and safer than plain message signing
 */
export async function signTypedDataWithViem<
  const TTypedData extends Record<string, unknown>,
  TPrimaryType extends string,
>(
  walletClient: SignerWalletClient,
  params: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Hex;
    };
    types: TTypedData;
    primaryType: TPrimaryType;
    message: Record<string, unknown>;
  }
): Promise<Hex> {
  return signTypedData(
    walletClient as any,
    {
      account: walletClient.account,
      ...params,
    } as any
  );
}
