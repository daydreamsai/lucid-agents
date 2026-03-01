/**
 * TRC-8004 TRON Support
 *
 * Adapters and utilities for using ERC-8004 identity registries on the TRON network.
 * TronWeb must be installed separately as a peer dependency.
 *
 * @example
 * ```ts
 * import { createIdentityRegistryClient } from '@lucid-agents/identity';
 * import {
 *   createTronPublicClient,
 *   createTronWalletClient,
 *   TRON_CHAINS,
 *   getTronRegistryAddresses,
 * } from '@lucid-agents/identity/tron';
 * import TronWeb from 'tronweb';
 *
 * const tronWeb = new TronWeb({
 *   fullHost: 'https://api.shasta.trongrid.io',
 *   privateKey: 'your-private-key',
 * });
 * const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);
 *
 * const client = createIdentityRegistryClient({
 *   address: addrs.IDENTITY_REGISTRY,
 *   chainId: TRON_CHAINS.SHASTA,
 *   namespace: 'tron',
 *   publicClient: createTronPublicClient(tronWeb),
 *   walletClient: createTronWalletClient(tronWeb),
 * });
 *
 * const record = await client.get(1n);
 * ```
 */

export {
  hexToTronBase58,
  isTronAddress,
  normalizeTronAddress,
  tronBase58ToHex,
} from './address';
export {
  createTronPublicClient,
  createTronWalletClient,
  makeTronClientFactory,
} from './client';
export {
  getTronRegistryAddress,
  getTronRegistryAddresses,
  isTronChainSupported,
  TRON_CHAINS,
  TRON_NAMESPACE,
  type TronChainId,
} from './config';
export type {
  TronContractLike,
  TronPublicClientOptions,
  TronWalletClientOptions,
  TronWebLike,
} from './types';
