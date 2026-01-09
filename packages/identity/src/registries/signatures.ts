/**
 * ERC-8004 specific signature helpers
 * Uses wallet package utilities for standard signing operations
 */

import type { Hex, SignerWalletClient } from '@lucid-agents/wallet';
import { signMessageWithViem } from '@lucid-agents/wallet';
import { keccak256, stringToBytes } from 'viem';

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
 * Hash a validation request URI or content to create a request hash
 * This is used to uniquely identify validation requests on-chain
 */
export function hashValidationRequest(content: string): Hex {
  return keccak256(stringToBytes(content));
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
