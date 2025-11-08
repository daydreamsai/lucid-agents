/**
 * ERC-8004 Validation Registry Client
 * Handles validation requests and responses for agent work verification
 */

import { VALIDATION_REGISTRY_ABI } from '../abi/types';
import type { Hex } from '../utils';
import type { PublicClientLike, WalletClientLike } from './identity';

/**
 * Default tag value for validation operations (zero bytes32)
 */
const DEFAULT_TAG: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

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

/**
 * Validation request entry
 */
export type ValidationRequest = {
  validatorAddress: Hex;
  agentId: bigint;
  requestUri: string;
  requestHash: Hex;
  timestamp: bigint;
};

/**
 * Validation status/response
 */
export type ValidationStatus = {
  validatorAddress: Hex;
  agentId: bigint;
  response: number; // Validation result code
  tag: Hex;
  lastUpdate: bigint;
};

/**
 * Parameters for creating a validation request
 */
export type CreateValidationRequestInput = {
  validatorAddress: Hex;
  agentId: bigint;
  requestUri: string;
  requestHash: Hex;
};

/**
 * Parameters for submitting a validation response
 */
export type SubmitValidationResponseInput = {
  requestHash: Hex;
  response: number; // Result code
  responseUri: string;
  responseHash: Hex;
  tag?: Hex;
};

/**
 * Validation summary statistics
 */
export type ValidationSummary = {
  count: bigint;
  avgResponse: number;
};

export type ValidationRegistryClient = {
  readonly address: Hex;
  readonly chainId: number;

  // Core write operations
  createRequest(input: CreateValidationRequestInput): Promise<Hex>;
  submitResponse(input: SubmitValidationResponseInput): Promise<Hex>;

  // Read operations
  getRequest(requestHash: Hex): Promise<ValidationRequest | null>;
  getValidationStatus(requestHash: Hex): Promise<ValidationStatus | null>;
  requestExists(requestHash: Hex): Promise<boolean>;

  getAgentValidations(agentId: bigint): Promise<Hex[]>;
  getValidatorRequests(validatorAddress: Hex): Promise<Hex[]>;

  getSummary(
    agentId: bigint,
    options?: {
      validatorAddresses?: Hex[];
      tag?: Hex;
    }
  ): Promise<ValidationSummary>;
};

/**
 * Create a Validation Registry client
 */
export function createValidationRegistryClient<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
>(
  options: ValidationRegistryClientOptions<PublicClient, WalletClient>
): ValidationRegistryClient {
  const {
    address,
    chainId,
    publicClient,
    walletClient,
    identityRegistryAddress,
  } = options;

  function ensureWalletClient(): WalletClientLike {
    if (!walletClient) {
      throw new Error(
        'Validation registry client requires walletClient for write operations'
      );
    }
    return walletClient;
  }

  return {
    address,
    chainId,

    async createRequest(input) {
      const wallet = ensureWalletClient();

      const txHash = await wallet.writeContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'validationRequest',
        args: [
          input.validatorAddress,
          input.agentId,
          input.requestUri,
          input.requestHash,
        ],
      });

      return txHash;
    },

    async submitResponse(input) {
      const wallet = ensureWalletClient();

      const tag = input.tag ?? DEFAULT_TAG;

      const txHash = await wallet.writeContract({
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

      return txHash;
    },

    async getRequest(requestHash) {
      try {
        const result = (await publicClient.readContract({
          address,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: 'getRequest',
          args: [requestHash],
        })) as [Hex, bigint, string, bigint];

        const [validatorAddress, agentId, requestUri, timestamp] = result;

        return {
          validatorAddress,
          agentId,
          requestUri,
          requestHash,
          timestamp,
        };
      } catch (error) {
        return null;
      }
    },

    async getValidationStatus(requestHash) {
      try {
        const result = (await publicClient.readContract({
          address,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: 'getValidationStatus',
          args: [requestHash],
        })) as [Hex, bigint, number, Hex, bigint];

        const [validatorAddress, agentId, response, tag, lastUpdate] = result;

        return {
          validatorAddress,
          agentId,
          response,
          tag,
          lastUpdate,
        };
      } catch (error) {
        return null;
      }
    },

    async requestExists(requestHash) {
      const exists = (await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'requestExists',
        args: [requestHash],
      })) as boolean;

      return exists;
    },

    async getAgentValidations(agentId) {
      const requestHashes = (await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'getAgentValidations',
        args: [agentId],
      })) as Hex[];

      return requestHashes;
    },

    async getValidatorRequests(validatorAddress) {
      const requestHashes = (await publicClient.readContract({
        address,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'getValidatorRequests',
        args: [validatorAddress],
      })) as Hex[];

      return requestHashes;
    },

    async getSummary(agentId, options = {}) {
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
    },
  };
}
