/**
 * ERC-8004 Reputation Registry Client
 * Handles peer feedback system for agent reputation
 */

import { REPUTATION_REGISTRY_ABI } from '../abi/types';
import type { Hex, SignerWalletClient } from '../utils';
import { normalizeAddress, signFeedbackAuth } from '../utils';
import type { PublicClientLike, WalletClientLike } from './identity';

export type ReputationRegistryClientOptions<
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
 * Feedback entry returned from the registry
 */
export type FeedbackEntry = {
  agentId: bigint;
  clientAddress: Hex;
  feedbackIndex: bigint;
  score: number; // 0-100
  tag1: Hex;
  tag2: Hex;
  fileUri: string;
  fileHash: Hex;
  isRevoked: boolean;
  responseCount?: bigint;
};

/**
 * Parameters for giving feedback
 */
export type GiveFeedbackInput = {
  toAgentId: bigint;
  score: number; // 0-100
  tag1?: string | Hex;
  tag2?: string | Hex;
  fileUri?: string;
  fileHash?: Hex;
  feedbackAuth?: Hex; // Pre-signed authorization, or we'll sign it
  expiry?: number; // Unix timestamp for signature expiry
  indexLimit?: bigint; // Max feedback index this signature is valid for
};

/**
 * Parameters for revoking feedback
 */
export type RevokeFeedbackInput = {
  agentId: bigint;
  feedbackIndex: bigint;
};

/**
 * Parameters for appending a response to feedback
 */
export type AppendResponseInput = {
  agentId: bigint;
  clientAddress: Hex;
  feedbackIndex: bigint;
  responseUri: string;
  responseHash: Hex;
};

/**
 * Summary statistics for an agent's reputation
 */
export type ReputationSummary = {
  count: bigint;
  averageScore: number; // 0-100
};

export type ReputationRegistryClient = {
  readonly address: Hex;
  readonly chainId: number;

  // Core write operations
  giveFeedback(input: GiveFeedbackInput): Promise<Hex>;
  revokeFeedback(input: RevokeFeedbackInput): Promise<Hex>;
  appendResponse(input: AppendResponseInput): Promise<Hex>;

  // Read operations
  getFeedback(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint
  ): Promise<FeedbackEntry | null>;

  getAllFeedback(
    agentId: bigint,
    options?: {
      clientAddresses?: Hex[];
      tag1?: Hex;
      tag2?: Hex;
      includeRevoked?: boolean;
    }
  ): Promise<FeedbackEntry[]>;

  getSummary(
    agentId: bigint,
    options?: {
      clientAddresses?: Hex[];
      tag1?: Hex;
      tag2?: Hex;
    }
  ): Promise<ReputationSummary>;

  getClients(agentId: bigint): Promise<Hex[]>;

  getLastIndex(agentId: bigint, clientAddress: Hex): Promise<bigint>;

  getResponseCount(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint,
    responders: Hex[]
  ): Promise<bigint>;
};

/**
 * Convert string to bytes32 for tags
 */
function stringToBytes32(str: string): Hex {
  if (str.startsWith('0x')) {
    // Validate hex string is proper bytes32 format
    if (!/^0x[0-9a-fA-F]{64}$/.test(str)) {
      throw new Error(`Invalid bytes32 hex string: ${str}`);
    }
    return str as Hex;
  }
  // Convert string to bytes32
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  if (bytes.length > 32) {
    throw new Error(`Tag "${str}" is too long (max 32 bytes)`);
  }
  // Pad to 32 bytes
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return `0x${Array.from(padded)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

/**
 * Create a Reputation Registry client
 */
export function createReputationRegistryClient<
  PublicClient extends PublicClientLike,
  WalletClient extends WalletClientLike | undefined = undefined,
>(
  options: ReputationRegistryClientOptions<PublicClient, WalletClient>
): ReputationRegistryClient {
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
        'Reputation registry client requires walletClient for write operations'
      );
    }
    return walletClient;
  }

  return {
    address,
    chainId,

    async giveFeedback(input) {
      const wallet = ensureWalletClient();
      const clientAddress = normalizeAddress(wallet.account?.address);

      if (!clientAddress) {
        throw new Error('Wallet account address is required');
      }

      // Normalize tags
      const tag1 = input.tag1
        ? typeof input.tag1 === 'string'
          ? stringToBytes32(input.tag1)
          : input.tag1
        : ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const tag2 = input.tag2
        ? typeof input.tag2 === 'string'
          ? stringToBytes32(input.tag2)
          : input.tag2
        : ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      // Generate feedback authorization signature if not provided
      let feedbackAuth = input.feedbackAuth;
      if (!feedbackAuth) {
        const expiry = input.expiry ?? Math.floor(Date.now() / 1000) + 3600; // 1 hour default
        const indexLimit = input.indexLimit ?? 1000n;

        feedbackAuth = await signFeedbackAuth(wallet as SignerWalletClient, {
          fromAddress: clientAddress,
          toAgentId: input.toAgentId,
          score: input.score,
          chainId,
          expiry,
          indexLimit,
        });
      }

      // Call contract
      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'giveFeedback',
        args: [
          input.toAgentId,
          input.score,
          tag1,
          tag2,
          input.fileUri ?? '',
          input.fileHash ??
            ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex),
          feedbackAuth,
        ],
      });

      return txHash;
    },

    async revokeFeedback(input) {
      const wallet = ensureWalletClient();

      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'revokeFeedback',
        args: [input.agentId, input.feedbackIndex],
      });

      return txHash;
    },

    async appendResponse(input) {
      const wallet = ensureWalletClient();

      const txHash = await wallet.writeContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'appendResponse',
        args: [
          input.agentId,
          input.clientAddress,
          input.feedbackIndex,
          input.responseUri,
          input.responseHash,
        ],
      });

      return txHash;
    },

    async getFeedback(agentId, clientAddress, feedbackIndex) {
      try {
        const result = (await publicClient.readContract({
          address,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'readFeedback',
          args: [agentId, clientAddress, feedbackIndex],
        })) as [number, Hex, Hex, boolean];

        const [score, tag1, tag2, isRevoked] = result;

        return {
          agentId,
          clientAddress,
          feedbackIndex,
          score,
          tag1,
          tag2,
          fileUri: '', // Not returned by readFeedback
          fileHash:
            '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          isRevoked,
        };
      } catch (error) {
        return null;
      }
    },

    async getAllFeedback(agentId, options = {}) {
      const clientAddresses = options.clientAddresses ?? [];
      const tag1 =
        options.tag1 ??
        ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);
      const tag2 =
        options.tag2 ??
        ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);
      const includeRevoked = options.includeRevoked ?? false;

      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'readAllFeedback',
        args: [agentId, clientAddresses, tag1, tag2, includeRevoked],
      })) as [Hex[], number[], Hex[], Hex[], boolean[]];

      const [clients, scores, tag1s, tag2s, revokedStatuses] = result;

      return clients.map((client, i) => ({
        agentId,
        clientAddress: client,
        feedbackIndex: BigInt(i),
        score: scores[i],
        tag1: tag1s[i],
        tag2: tag2s[i],
        fileUri: '',
        fileHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        isRevoked: revokedStatuses[i],
      }));
    },

    async getSummary(agentId, options = {}) {
      const clientAddresses = options.clientAddresses ?? [];
      const tag1 =
        options.tag1 ??
        ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);
      const tag2 =
        options.tag2 ??
        ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);

      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getSummary',
        args: [agentId, clientAddresses, tag1, tag2],
      })) as [bigint, number];

      const [count, averageScore] = result;

      return {
        count,
        averageScore,
      };
    },

    async getClients(agentId) {
      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getClients',
        args: [agentId],
      })) as Hex[];

      return result;
    },

    async getLastIndex(agentId, clientAddress) {
      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getLastIndex',
        args: [agentId, clientAddress],
      })) as bigint;

      return result;
    },

    async getResponseCount(agentId, clientAddress, feedbackIndex, responders) {
      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getResponseCount',
        args: [agentId, clientAddress, feedbackIndex, responders],
      })) as bigint;

      return result;
    },
  };
}
