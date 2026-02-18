/**
 * TRC-8004 TRON Support — Client Adapters
 *
 * Implements PublicClientLike and WalletClientLike interfaces using TronWeb,
 * allowing TRON contracts to be used with the existing lucid-agents registry clients.
 *
 * The adapters handle address format conversion (0x hex ↔ TRON base58) transparently,
 * so the rest of the lucid-agents codebase works without modification.
 */

import type { Hex } from '@lucid-agents/wallet';

import type {
  BootstrapIdentityClientFactory,
  PublicClientLike,
  WalletClientLike,
} from '../registries/identity';
import { hexToTronBase58 } from './address';
import type { TronWebLike } from './types';

/**
 * Create a PublicClientLike adapter backed by TronWeb.
 *
 * Translates `readContract` calls from the lucid-agents interface
 * into TronWeb contract method calls.
 *
 * @example
 * ```ts
 * import TronWeb from 'tronweb';
 * import { createTronPublicClient } from '@lucid-agents/identity/tron';
 *
 * const tronWeb = new TronWeb({ fullHost: 'https://api.shasta.trongrid.io' });
 * const publicClient = createTronPublicClient(tronWeb);
 * ```
 */
export function createTronPublicClient(tronWeb: TronWebLike): PublicClientLike {
  // Cache contract instances by address to avoid re-instantiating
  const contractCache = new Map<
    string,
    Awaited<ReturnType<TronWebLike['contract']>>
  >();

  return {
    async readContract(args: {
      address: Hex;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<unknown> {
      const tronAddr = await hexToTronBase58(args.address);
      const cacheKey = tronAddr;

      let contract = contractCache.get(cacheKey);
      if (!contract) {
        contract = await tronWeb.contract(args.abi, tronAddr);
        contractCache.set(cacheKey, contract);
      }

      const method = contract.methods[args.functionName];
      if (!method) {
        throw new Error(
          `Method '${args.functionName}' not found on TRON contract ${tronAddr}`
        );
      }

      return await method(...(args.args ?? [])).call();
    },
  };
}

/**
 * Create a WalletClientLike adapter backed by TronWeb.
 *
 * Translates `writeContract` calls from the lucid-agents interface
 * into TronWeb contract method send calls. The TronWeb instance must
 * have a default address with signing capability (private key configured).
 *
 * @example
 * ```ts
 * import TronWeb from 'tronweb';
 * import { createTronWalletClient } from '@lucid-agents/identity/tron';
 *
 * const tronWeb = new TronWeb({
 *   fullHost: 'https://api.shasta.trongrid.io',
 *   privateKey: 'your-private-key',
 * });
 * const walletClient = createTronWalletClient(tronWeb);
 * ```
 */
export function createTronWalletClient(tronWeb: TronWebLike): WalletClientLike {
  // TronWeb hex addresses use 41-prefix (e.g., "41abc123...").
  // Convert to 0x-prefixed EVM format by stripping the 41 prefix.
  const rawHex = tronWeb.defaultAddress.hex;
  const evmAddress = rawHex.startsWith('41')
    ? (`0x${rawHex.slice(2).toLowerCase()}` as Hex)
    : (`0x${rawHex.toLowerCase()}` as Hex);

  // Cache contract instances by address
  const contractCache = new Map<
    string,
    Awaited<ReturnType<TronWebLike['contract']>>
  >();

  return {
    account: { address: evmAddress },

    async writeContract(args: {
      address: Hex;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<Hex> {
      const tronAddr = await hexToTronBase58(args.address);
      const cacheKey = tronAddr;

      let contract = contractCache.get(cacheKey);
      if (!contract) {
        contract = await tronWeb.contract(args.abi, tronAddr);
        contractCache.set(cacheKey, contract);
      }

      const method = contract.methods[args.functionName];
      if (!method) {
        throw new Error(
          `Method '${args.functionName}' not found on TRON contract ${tronAddr}`
        );
      }

      const txId = await method(...(args.args ?? [])).send();

      // TronWeb returns a txId string (64-char hex without 0x prefix)
      // Normalize to 0x-prefixed hex for compatibility
      return (txId.startsWith('0x') ? txId : `0x${txId}`) as Hex;
    },
  };
}

/**
 * Create a BootstrapIdentityClientFactory for TRON.
 *
 * This factory can be passed to `bootstrapIdentity({ makeClients })` or
 * `createAgentIdentity()` to use TRON instead of viem/EVM.
 *
 * @example
 * ```ts
 * import TronWeb from 'tronweb';
 * import { makeTronClientFactory, TRON_CHAINS } from '@lucid-agents/identity/tron';
 * import { bootstrapIdentity } from '@lucid-agents/identity';
 *
 * const tronWeb = new TronWeb({ fullHost: 'https://api.shasta.trongrid.io', privateKey: '...' });
 *
 * const result = await bootstrapIdentity({
 *   chainId: TRON_CHAINS.SHASTA,
 *   namespace: 'tron',
 *   makeClients: makeTronClientFactory(tronWeb),
 *   registryAddress: getTronRegistryAddresses(TRON_CHAINS.SHASTA).IDENTITY_REGISTRY,
 *   domain: 'my-agent.example.com',
 * });
 * ```
 */
export function makeTronClientFactory(
  tronWeb: TronWebLike
): BootstrapIdentityClientFactory {
  return () => ({
    publicClient: createTronPublicClient(tronWeb),
    walletClient: createTronWalletClient(tronWeb),
  });
}
