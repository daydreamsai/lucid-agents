import type { Abi, ContractFunctionName } from 'viem';

import identityRegistryAbiJson from './IdentityRegistry.json';
import reputationRegistryAbiJson from './ReputationRegistry.json';
import validationRegistryAbiJson from './ValidationRegistry.json';

/**
 * ERC-8004 Identity Registry ABI
 * Typed as viem's Abi for proper type inference with contract interactions
 */
export const IDENTITY_REGISTRY_ABI = identityRegistryAbiJson as Abi;

/**
 * ERC-8004 Reputation Registry ABI
 * Handles peer feedback and reputation system
 */
export const REPUTATION_REGISTRY_ABI = reputationRegistryAbiJson as Abi;

/**
 * ERC-8004 Validation Registry ABI
 * Handles validation requests and responses
 */
export const VALIDATION_REGISTRY_ABI = validationRegistryAbiJson as Abi;

/**
 * Valid read function names extracted from the Identity Registry ABI
 * Includes all view/pure functions from the contract
 */
export type IdentityRegistryReadFunctionName = ContractFunctionName<
  typeof IDENTITY_REGISTRY_ABI,
  'view' | 'pure'
>;

/**
 * Valid write function names extracted from the Identity Registry ABI
 * Includes all nonpayable/payable functions from the contract
 */
export type IdentityRegistryWriteFunctionName = ContractFunctionName<
  typeof IDENTITY_REGISTRY_ABI,
  'nonpayable' | 'payable'
>;

/**
 * Valid read function names for Reputation Registry
 */
export type ReputationRegistryReadFunctionName = ContractFunctionName<
  typeof REPUTATION_REGISTRY_ABI,
  'view' | 'pure'
>;

/**
 * Valid write function names for Reputation Registry
 */
export type ReputationRegistryWriteFunctionName = ContractFunctionName<
  typeof REPUTATION_REGISTRY_ABI,
  'nonpayable' | 'payable'
>;

/**
 * Valid read function names for Validation Registry
 */
export type ValidationRegistryReadFunctionName = ContractFunctionName<
  typeof VALIDATION_REGISTRY_ABI,
  'view' | 'pure'
>;

/**
 * Valid write function names for Validation Registry
 */
export type ValidationRegistryWriteFunctionName = ContractFunctionName<
  typeof VALIDATION_REGISTRY_ABI,
  'nonpayable' | 'payable'
>;
