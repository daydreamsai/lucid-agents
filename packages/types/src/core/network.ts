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
 * 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' // Solana Mainnet
 * 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' // Solana Devnet
 *
 * @see https://chainagnostic.org/CAIPs/caip-2
 */
export type Network = `${string}:${string}`;
