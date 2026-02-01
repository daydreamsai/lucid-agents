/**
 * ERC-8004 Reputation Registry Client
 * Handles peer feedback system for agent reputation
 */

import type { Hex } from '@lucid-agents/wallet';

import { REPUTATION_REGISTRY_ABI } from '../abi/types';
import type { PublicClientLike, WalletClientLike } from './identity';
import { waitForConfirmation } from './utils';

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

export type FeedbackEntry = {
  agentId: bigint;
  clientAddress: Hex;
  feedbackIndex: bigint;
  /** Signed integer value; interpret with valueDecimals. */
  value: bigint;
  /** Number of decimal places for value. */
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
  responseCount?: bigint;
};

export type GiveFeedbackInput = {
  toAgentId: bigint;
  /** Signed integer value; interpret with valueDecimals. */
  value: bigint | number | string;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string; // Optional for convenience (defaults to empty string if not provided)
  feedbackURI?: string;
  feedbackHash?: Hex;
};

export type RevokeFeedbackInput = {
  agentId: bigint;
  feedbackIndex: bigint;
};

export type AppendResponseInput = {
  agentId: bigint;
  clientAddress: Hex;
  feedbackIndex: bigint;
  responseUri: string;
  responseHash: Hex;
};

export type ReputationSummary = {
  count: bigint;
  value: bigint;
  valueDecimals: number;
};

export type ReputationRegistryClient = {
  readonly address: Hex;
  readonly chainId: number;

  getIdentityRegistry(): Promise<Hex>;
  getFeedback(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint
  ): Promise<FeedbackEntry | null>;
  getAllFeedback(
    agentId: bigint,
    options?: {
      clientAddresses?: Hex[];
      tag1?: string;
      tag2?: string;
      includeRevoked?: boolean;
    }
  ): Promise<FeedbackEntry[]>;
  getSummary(
    agentId: bigint,
    options?: {
      clientAddresses?: Hex[];
      tag1?: string;
      tag2?: string;
    }
  ): Promise<ReputationSummary>;
  getVersion(): Promise<string>;
  getClients(agentId: bigint): Promise<Hex[]>;
  getLastIndex(agentId: bigint, clientAddress: Hex): Promise<bigint>;
  getResponseCount(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint,
    responders: Hex[]
  ): Promise<bigint>;
  giveFeedback(input: GiveFeedbackInput): Promise<Hex>;
  revokeFeedback(input: RevokeFeedbackInput): Promise<Hex>;
  appendResponse(input: AppendResponseInput): Promise<Hex>;
};

function normalizeFeedbackValue(input: GiveFeedbackInput['value']): bigint {
  if (typeof input === 'bigint') {
    return input;
  }
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new Error('value must be an integer; use valueDecimals for scaling');
    }
    return BigInt(input);
  }
  const trimmed = input.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error('value must be a base-10 integer string');
  }
  return BigInt(trimmed);
}

function normalizeValueDecimals(input: number | undefined): number {
  const valueDecimals = input ?? 0;
  if (!Number.isInteger(valueDecimals) || valueDecimals < 0) {
    throw new Error('valueDecimals must be a non-negative integer');
  }
  return valueDecimals;
}

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

  async function getFeedback(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint
  ): Promise<FeedbackEntry | null> {
    try {
      const result = (await publicClient.readContract({
        address,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'readFeedback',
        args: [agentId, clientAddress, feedbackIndex],
      })) as [bigint, number, string, string, boolean];

      const [value, valueDecimals, tag1, tag2, isRevoked] = result;

      return {
        agentId,
        clientAddress,
        feedbackIndex,
        value,
        valueDecimals,
        tag1,
        tag2,
        isRevoked,
      };
    } catch {
      return null;
    }
  }

  async function getAllFeedback(
    agentId: bigint,
    options: {
      clientAddresses?: Hex[];
      tag1?: string;
      tag2?: string;
      includeRevoked?: boolean;
    } = {}
  ): Promise<FeedbackEntry[]> {
    const clientAddresses = options.clientAddresses ?? [];
    const tag1 = options.tag1 ?? '';
    const tag2 = options.tag2 ?? '';
    const includeRevoked = options.includeRevoked ?? false;

    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'readAllFeedback',
      args: [agentId, clientAddresses, tag1, tag2, includeRevoked],
    })) as [
      Hex[],
      bigint[],
      bigint[],
      number[],
      string[],
      string[],
      boolean[],
    ];

    const [
      clients,
      feedbackIndexes,
      values,
      valueDecimals,
      tag1s,
      tag2s,
      revokedStatuses,
    ] = result;

    return clients.map((client, i) => ({
      agentId,
      clientAddress: client,
      feedbackIndex: feedbackIndexes[i],
      value: values[i],
      valueDecimals: valueDecimals[i],
      tag1: tag1s[i],
      tag2: tag2s[i],
      isRevoked: revokedStatuses[i],
    }));
  }

  async function getSummary(
    agentId: bigint,
    options: {
      clientAddresses?: Hex[];
      tag1?: string;
      tag2?: string;
    } = {}
  ): Promise<ReputationSummary> {
    const clientAddresses = options.clientAddresses ?? [];
    const tag1 = options.tag1 ?? '';
    const tag2 = options.tag2 ?? '';

    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getSummary',
      args: [agentId, clientAddresses, tag1, tag2],
    })) as [bigint, bigint, number];

    const [count, value, valueDecimals] = result;

    return {
      count,
      value,
      valueDecimals,
    };
  }

  async function getClients(agentId: bigint): Promise<Hex[]> {
    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getClients',
      args: [agentId],
    })) as Hex[];

    return result;
  }

  async function getIdentityRegistry(): Promise<Hex> {
    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getIdentityRegistry',
      args: [],
    })) as Hex;

    return result;
  }

  async function getLastIndex(
    agentId: bigint,
    clientAddress: Hex
  ): Promise<bigint> {
    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getLastIndex',
      args: [agentId, clientAddress],
    })) as bigint;

    return result;
  }

  async function getResponseCount(
    agentId: bigint,
    clientAddress: Hex,
    feedbackIndex: bigint,
    responders: Hex[]
  ): Promise<bigint> {
    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getResponseCount',
      args: [agentId, clientAddress, feedbackIndex, responders],
    })) as bigint;

    return result;
  }

  async function giveFeedback(input: GiveFeedbackInput): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for giveFeedback');
    }
    if (!walletClient.account?.address) {
      throw new Error('Wallet account address is required');
    }

    const tag1 = input.tag1 ?? '';
    const tag2 = input.tag2 ?? '';
    // endpoint is optional for convenience, defaults to empty string (contract accepts empty string)
    const endpoint = input.endpoint ?? '';
    const feedbackURI = input.feedbackURI ?? '';
    const feedbackHash =
      input.feedbackHash ??
      ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex);
    const value = normalizeFeedbackValue(input.value);
    const valueDecimals = normalizeValueDecimals(input.valueDecimals);

    const txHash = await walletClient.writeContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'giveFeedback',
      args: [
        input.toAgentId,
        value,
        valueDecimals,
        tag1,
        tag2,
        endpoint,
        feedbackURI,
        feedbackHash,
      ],
    });

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  async function revokeFeedback(input: RevokeFeedbackInput): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for revokeFeedback');
    }

    const txHash = await walletClient.writeContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'revokeFeedback',
      args: [input.agentId, input.feedbackIndex],
    });

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  async function appendResponse(input: AppendResponseInput): Promise<Hex> {
    if (!walletClient) {
      throw new Error('Wallet client required for appendResponse');
    }

    const txHash = await walletClient.writeContract({
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

    await waitForConfirmation(publicClient, txHash);

    return txHash;
  }

  async function getVersion(): Promise<string> {
    const result = (await publicClient.readContract({
      address,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getVersion',
      args: [],
    })) as string;

    return result;
  }

  return {
    address,
    chainId,
    getIdentityRegistry,
    getFeedback,
    getAllFeedback,
    getSummary,
    getClients,
    getLastIndex,
    getResponseCount,
    giveFeedback,
    revokeFeedback,
    appendResponse,
    getVersion,
  };
}
