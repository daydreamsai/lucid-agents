/**
 * TRC-8004 TRON Support — Type Definitions
 *
 * Minimal interface definitions for TronWeb interop.
 * These types allow the TRON adapter to work without a hard dependency on tronweb.
 * Users must install tronweb separately to use the TRON adapter.
 */

/**
 * Minimal interface for a TronWeb contract instance.
 * Matches the shape returned by `tronWeb.contract(abi, address)`.
 */
export type TronContractLike = {
  methods: Record<
    string,
    (...args: unknown[]) => {
      call(): Promise<unknown>;
      send(options?: Record<string, unknown>): Promise<string>;
    }
  >;
};

/**
 * Minimal interface for a TronWeb instance.
 * Only includes the methods needed by the TRON adapter.
 */
export type TronWebLike = {
  defaultAddress: {
    base58: string;
    hex: string;
  };
  contract(abi: readonly unknown[], address: string): Promise<TronContractLike>;
};

/**
 * Options for creating a TRON public client adapter.
 */
export type TronPublicClientOptions = {
  tronWeb: TronWebLike;
};

/**
 * Options for creating a TRON wallet client adapter.
 */
export type TronWalletClientOptions = {
  tronWeb: TronWebLike;
};
