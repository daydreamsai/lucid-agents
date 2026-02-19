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
import { isTronChainSupported } from './config';
import type { TronContractLike, TronWebLike } from './types';

type ContractCache = Map<string, TronContractLike>;

/**
 * Resolve a contract method from the cache, rehydrating if the method is
 * missing (e.g. because the cached contract was created with a different ABI).
 */
async function resolveMethod(
  contractCache: ContractCache,
  tronWeb: TronWebLike,
  address: Hex,
  abi: readonly unknown[],
  functionName: string
): Promise<TronContractLike['methods'][string]> {
  const tronAddr = await hexToTronBase58(address);

  let contract = contractCache.get(tronAddr);
  if (!contract) {
    contract = await tronWeb.contract(abi, tronAddr);
    contractCache.set(tronAddr, contract);
  }

  let method = contract.methods[functionName];
  if (!method) {
    // ABI mismatch — rehydrate the contract with the new ABI
    contract = await tronWeb.contract(abi, tronAddr);
    contractCache.set(tronAddr, contract);
    method = contract.methods[functionName];
  }

  if (!method) {
    throw new Error(
      `Method '${functionName}' not found on TRON contract ${tronAddr}`
    );
  }

  return method;
}

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
  const contractCache: ContractCache = new Map();

  return {
    async readContract(args: {
      address: Hex;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<unknown> {
      const method = await resolveMethod(
        contractCache,
        tronWeb,
        args.address,
        args.abi,
        args.functionName
      );

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
  if (!rawHex) {
    throw new Error(
      'createTronWalletClient: TronWeb instance has no default address configured. ' +
        'Provide a private key to the TronWeb constructor.'
    );
  }
  // Strip any leading 0x before checking the 41 TRON prefix
  const cleanHex = rawHex.startsWith('0x') || rawHex.startsWith('0X')
    ? rawHex.slice(2)
    : rawHex;
  const evmAddress = cleanHex.startsWith('41')
    ? (`0x${cleanHex.slice(2).toLowerCase()}` as Hex)
    : (`0x${cleanHex.toLowerCase()}` as Hex);

  const contractCache: ContractCache = new Map();

  return {
    account: { address: evmAddress },

    async writeContract(args: {
      address: Hex;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<Hex> {
      const method = await resolveMethod(
        contractCache,
        tronWeb,
        args.address,
        args.abi,
        args.functionName
      );

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
 * The provided TronWeb instance must be configured for the same network as the
 * `chainId` passed to `bootstrapIdentity`. The factory validates that the
 * supplied `chainId` is a supported TRON chain and throws if it is not.
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
  return ({ chainId }) => {
    if (!isTronChainSupported(chainId)) {
      throw new Error(
        `makeTronClientFactory: chainId ${chainId} is not a supported TRON chain. ` +
          `Configure the TronWeb instance to match the intended chain.`
      );
    }
    return {
      publicClient: createTronPublicClient(tronWeb),
      walletClient: createTronWalletClient(tronWeb),
    };
  };
}
