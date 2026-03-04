/**
 * Solana identity and reputation registry clients.
 *
 * These clients interface with the 8004-solana Solana program, which is
 * the Solana analog of ERC-8004. The program manages agent identity NFTs
 * and reputation feedback on-chain.
 *
 * Program ID: The default devnet/mainnet program ID is configurable via
 * SOLANA_IDENTITY_PROGRAM_ID env var. A canonical deployment will be
 * provided once the 8004-solana program is published.
 */

export * from './identity';
export * from './reputation';
