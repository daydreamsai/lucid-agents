/**
 * Signature helpers using Viem's proper action functions.
 * Supports EIP-191 (personal_sign) and EIP-712 (typed data) signing.
 */

import type { Account, WalletClient } from 'viem';
import { hashMessage, recoverMessageAddress } from 'viem';
import { signMessage, signTypedData, verifyMessage } from 'viem/actions';

import type { Hex } from './types';

/**
 * Viem WalletClient type for signature operations
 * Accepts any WalletClient with an account
 */
export type SignerWalletClient = WalletClient & { account: Account };

/**
 * Sign a message using EIP-191 (personal_sign)
 * This is the standard way to sign plain text messages
 */
export async function signMessageWithViem(
  walletClient: SignerWalletClient,
  message: string
): Promise<Hex> {
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

/**
 * Verify a signature from either EOA or smart contract wallet
 * Handles both EIP-191 and ERC-1271 automatically
 */
export async function verifySignature(params: {
  address: Hex;
  message: string;
  signature: Hex;
  publicClient: {
    verifyMessage: typeof verifyMessage;
  };
}): Promise<boolean> {
  try {
    // First try to recover address (works for EOA wallets)
    const recovered = await recoverMessageAddress({
      message: params.message,
      signature: params.signature,
    });

    if (recovered.toLowerCase() === params.address.toLowerCase()) {
      return true;
    }

    // Fallback to ERC-1271 for smart contract wallets
    return await verifyMessage(params.publicClient as any, {
      address: params.address,
      message: params.message,
      signature: params.signature,
    });
  } catch (error) {
    return false;
  }
}

/**
 * Hash a message according to EIP-191
 * Useful for debugging or manual signature verification
 */
export function hashMessageEIP191(message: string): Hex {
  return hashMessage(message);
}

/**
 * Recover the address that signed a message
 * Only works for EOA wallets (not smart contract wallets)
 */
export async function recoverSigner(
  message: string,
  signature: Hex
): Promise<Hex> {
  return recoverMessageAddress({
    message,
    signature,
  });
}

/**
 * Build ERC-8004 domain ownership proof message
 */
export function buildDomainProofMessage(params: {
  domain: string;
  address: Hex;
  chainId: number;
  nonce?: string;
}): string {
  const lines = [
    'ERC-8004 Agent Ownership Proof',
    `Domain: ${params.domain}`,
    `Address: ${params.address.toLowerCase()}`,
    `ChainId: ${params.chainId}`,
  ];
  if (params.nonce) {
    lines.push(`Nonce: ${params.nonce}`);
  }
  return lines.join('\n');
}

/**
 * Build ERC-8004 feedback authorization message
 */
export function buildFeedbackAuthMessage(params: {
  fromAddress: Hex;
  toAgentId: bigint;
  score: number;
  chainId: number;
  expiry: number;
  indexLimit: bigint;
}): string {
  return [
    'ERC-8004 Reputation Feedback Authorization',
    `From: ${params.fromAddress.toLowerCase()}`,
    `To Agent: ${params.toAgentId.toString()}`,
    `Score: ${params.score}`,
    `Chain ID: ${params.chainId}`,
    `Expiry: ${params.expiry}`,
    `Index Limit: ${params.indexLimit.toString()}`,
  ].join('\n');
}

/**
 * Build ERC-8004 validation request message
 */
export function buildValidationRequestMessage(params: {
  agentId: bigint;
  requestHash: Hex;
  validator: Hex;
  chainId: number;
  timestamp: number;
}): string {
  return [
    'ERC-8004 Validation Request',
    `Agent ID: ${params.agentId.toString()}`,
    `Request Hash: ${params.requestHash}`,
    `Validator: ${params.validator.toLowerCase()}`,
    `Chain ID: ${params.chainId}`,
    `Timestamp: ${params.timestamp}`,
  ].join('\n');
}

/**
 * Sign ERC-8004 domain proof using Viem
 */
export async function signDomainProof(
  walletClient: SignerWalletClient,
  params: {
    domain: string;
    address: Hex;
    chainId: number;
    nonce?: string;
  }
): Promise<Hex> {
  const message = buildDomainProofMessage(params);
  return signMessageWithViem(walletClient, message);
}

/**
 * Sign ERC-8004 feedback authorization using Viem
 */
export async function signFeedbackAuth(
  walletClient: SignerWalletClient,
  params: {
    fromAddress: Hex;
    toAgentId: bigint;
    score: number;
    chainId: number;
    expiry: number;
    indexLimit: bigint;
  }
): Promise<Hex> {
  const message = buildFeedbackAuthMessage(params);
  return signMessageWithViem(walletClient, message);
}

/**
 * Sign ERC-8004 validation request using Viem
 */
export async function signValidationRequest(
  walletClient: SignerWalletClient,
  params: {
    agentId: bigint;
    requestHash: Hex;
    validator: Hex;
    chainId: number;
    timestamp: number;
  }
): Promise<Hex> {
  const message = buildValidationRequestMessage(params);
  return signMessageWithViem(walletClient, message);
}
