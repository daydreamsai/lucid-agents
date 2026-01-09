/**
 * ERC-8004 Validation Registry Client
 * Handles validation requests and responses for agent work verification
 *
 * @deprecated Validation Registry is under active development and will be revised and expanded
 * in a follow-up spec update later this year. This client is kept for backward compatibility
 * but should not be used in new code until the spec is finalized.
 */

import type { Hex } from '@lucid-agents/wallet';

import { VALIDATION_REGISTRY_ABI } from '../abi/types';
import type { PublicClientLike, WalletClientLike } from './identity';
import { hashValidationRequest } from './signatures';
import { waitForConfirmation } from './utils';

// Tags are now strings, using empty string as default
const DEFAULT_TAG = '';

export type ValidationRegistryClientOptions<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
> = {
  address: Hex;
  chainId: number;
  publicClient: PublicClient;
  walletClient?: WalletClient;
  identityRegistryAddress: Hex;
};

export type ValidationRequest = {
  validatorAddress: Hex;
  agentId: bigint;
  requestUri: string;
  requestHash: Hex;
  timestamp: bigint;
};

export type ValidationStatus = {
  validatorAddress: Hex;
  agentId: bigint;
  response: number; // Validation result code
  responseHash: Hex;
  tag: string;
  lastUpdate: bigint;
};

export type CreateValidationRequestInput = {
  validatorAddress: Hex;
  agentId: bigint;
  requestUri: string;
  requestHash?: Hex; // Optional - will be computed from requestUri if not provided
};

export type SubmitValidationResponseInput = {
  requestHash: Hex;
  response: number; // Result code
  responseUri: string;
  responseHash: Hex;
  tag?: string;
};

export type ValidationSummary = {
  count: bigint;
  avgResponse: number;
};

export type ValidationRegistryClient = {
  readonly address: Hex;
  readonly chainId: number;

  getValidationStatus(requestHash: Hex): Promise<ValidationStatus | null>;
  getAgentValidations(agentId: bigint): Promise<Hex[]>;
  getValidatorRequests(validatorAddress: Hex): Promise<Hex[]>;
  getSummary(
    agentId: bigint,
    options?: {
      validatorAddresses?: Hex[];
      tag?: string;
    }
  ): Promise<ValidationSummary>;
  validationRequest(input: CreateValidationRequestInput): Promise<Hex>;
  validationResponse(input: SubmitValidationResponseInput): Promise<Hex>;
  getVersion(): Promise<string>;
};

export function createValidationRegistryClient<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
>(
  options: ValidationRegistryClientOptions<PublicClient, WalletClient>
): ValidationRegistryClient {
  const { address, chainId, publicClient, walletClient } = options;

  async function getValidationStatus(
    requestHash: Hex
  ): Promise<ValidationStatus | null> {
    try {
      const result = (await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'getValidationStatus',
        args: [requestHash],
      })) as [Hex, bigint, number, Hex, string, bigint];

      const [
        validatorAddress,
        agentId,
        response,
        responseHash,
        tag,
        lastUpdate,
      ] = result;

      // Check if this is a valid status (non-zero agentId indicates request exists)
      // Response 0 means pending/unresponded, which is valid
      if (agentId === 0n) {
        return null; // Request doesn't exist
      }

      return {
        validatorAddress,
        agentId,
        response,
        responseHash,
        tag,
        lastUpdate,
      };
    } catch {
      return null;
    }
  }

  async function getAgentValidations(agentId: bigint): Promise<Hex[]> {
    const requestHashes = (await publicClient.readContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getAgentValidations',
      args: [agentId],
    })) as Hex[];

    return requestHashes;
  }

  async function getValidatorRequests(validatorAddress: Hex): Promise<Hex[]> {
    const requestHashes = (await publicClient.readContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getValidatorRequests',
      args: [validatorAddress],
    })) as Hex[];

    return requestHashes;
  }

  async function getSummary(
    agentId: bigint,
    options: {
      validatorAddresses?: Hex[];
      tag?: string;
    } = {}
  ): Promise<ValidationSummary> {
    const validatorAddresses = options.validatorAddresses ?? [];
    const tag = options.tag ?? DEFAULT_TAG;

    const result = (await publicClient.readContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [agentId, validatorAddresses, tag],
    })) as [bigint, number];

    const [count, avgResponse] = result;

    return {
      count,
      avgResponse,
    };
  }

  async function validationRequest(
    input: CreateValidationRequestInput
  ): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for validationRequest');
    }

    // Compute request hash from URI if not provided
    const requestHash =
      input.requestHash ?? hashValidationRequest(input.requestUri);

    const txHash = await walletClient.writeContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'validationRequest',
      args: [
        input.validatorAddress,
        input.agentId,
        input.requestUri,
        requestHash,
      ],
    });

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  async function validationResponse(
    input: SubmitValidationResponseInput
  ): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for validationResponse');
    }

    const tag = input.tag ?? DEFAULT_TAG;

    const txHash = await walletClient.writeContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'validationResponse',
      args: [
        input.requestHash,
        input.response,
        input.responseUri,
        input.responseHash,
        tag,
      ],
    });

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  async function getVersion(): Promise<string> {
    const result = (await publicClient.readContract({
      address,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: 'getVersion',
      args: [],
    })) as string;

    return result;
  }

  return {
    address,
    chainId,
    getValidationStatus,
    getAgentValidations,
    getValidatorRequests,
    getSummary,
    validationRequest,
    validationResponse,
    getVersion,
  };
}
