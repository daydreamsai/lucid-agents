/**
 * ERC-8004 specific signature helpers
 * Uses wallet package utilities for standard signing operations
 */

import type { Hex, SignerWalletClient } from '@lucid-agents/wallet';
import { signMessageWithViem, signTypedDataWithViem } from '@lucid-agents/wallet';
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
 * Hash a validation request payload to create a request hash.
 * Pass the canonical request body when available; legacy callers may pass a URI.
 */
export function hashValidationRequest(content: string | Uint8Array): Hex {
  const bytes = typeof content === 'string' ? stringToBytes(content) : content;
  return keccak256(bytes);
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

export type AgentWalletTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Hex;
  };
  types: {
    AgentWallet: Array<{ name: string; type: string }>;
  };
  primaryType: 'AgentWallet';
  message: {
    agentId: string;
    newWallet: Hex;
    deadline: string;
  };
};

/**
 * Build EIP-712 typed data for setting an agent wallet.
 */
export function buildAgentWalletTypedData(params: {
  agentId: bigint;
  newWallet: Hex;
  deadline: bigint;
  chainId: number;
  verifyingContract: Hex;
  name?: string;
  version?: string;
}): AgentWalletTypedData {
  return {
    domain: {
      name: params.name ?? 'ERC-8004 Identity Registry',
      version: params.version ?? '1',
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      AgentWallet: [
        { name: 'agentId', type: 'uint256' },
        { name: 'newWallet', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'AgentWallet',
    message: {
      agentId: params.agentId.toString(10),
      newWallet: params.newWallet,
      deadline: params.deadline.toString(10),
    },
  };
}

/**
 * Sign an agent wallet update using EIP-712 typed data.
 */
export async function signAgentWalletProof(
  walletClient: SignerWalletClient,
  params: {
    agentId: bigint;
    newWallet: Hex;
    deadline: bigint;
    chainId: number;
    verifyingContract: Hex;
    name?: string;
    version?: string;
  }
): Promise<Hex> {
  const typedData = buildAgentWalletTypedData(params);
  return signTypedDataWithViem(walletClient, typedData);
}
