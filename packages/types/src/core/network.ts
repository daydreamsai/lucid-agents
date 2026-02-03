/**
 * Network identifier in CAIP-2 format.
 *
 * CAIP-2 format: `{namespace}:{reference}`
 *
 * @example
 * // EVM networks
 * 'eip155:8453'      // Base Mainnet
 * 'eip155:84532'     // Base Sepolia
 * 'eip155:1'         // Ethereum Mainnet
 * 'eip155:11155111'  // Ethereum Sepolia
 *
 * // Solana networks
 * 'solana:mainnet'   // Solana Mainnet
 * 'solana:devnet'    // Solana Devnet
 *
 * @see https://chainagnostic.org/CAIPs/caip-2
 */
export type Network = `${string}:${string}`;
