---
"@lucid-agents/agent-kit": patch
"@lucid-agents/agent-kit-hono": patch
"@lucid-agents/agent-kit-tanstack": patch
"@lucid-agents/create-agent-kit": patch
---

# Solana Payment Network Support

This release adds comprehensive support for Solana payment networks across all adapters and templates.

## New Features

### Solana Network Support

- **Solana Mainnet** (`solana`) and **Solana Devnet** (`solana-devnet`) are now fully supported for payment receiving
- Both Hono and TanStack adapters support Solana payments via x402 protocol
- Agents can now receive payments in SPL USDC tokens on Solana networks

### Interactive Network Selection

- All CLI templates now include an interactive dropdown for network selection:
  - Base Sepolia (EVM testnet)
  - Base (EVM mainnet)
  - Solana Devnet
  - Solana Mainnet
- Network selection replaces previous text input for better developer experience

### CLI Network Flag

- Added `--network` flag for non-interactive mode
- Examples:
  - `bunx @lucid-agents/create-agent-kit my-agent --network=solana-devnet`
  - `bunx @lucid-agents/create-agent-kit my-agent --network=solana`
- Flag skips network prompt and directly sets `PAYMENTS_NETWORK` in generated `.env`

## Improvements

### Network Validation

- Added runtime validation in `validatePaymentsConfig()` that dynamically imports supported networks from x402 library
- Invalid networks (e.g., `solana-mainnet`) are now rejected at configuration time with clear error messages
- Validation lists all supported networks in error output for better debugging

### Documentation

- Comprehensive Solana setup guide in all README and AGENTS.md files
- SPL USDC token addresses documented:
  - Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - Devnet: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- Solana configuration examples for both Hono and TanStack adapters
- Clarified address format differences: EVM (0x-prefixed) vs Solana (Base58)
- Explained separation between identity registration (EVM-only) and payment receiving (any network)

### Template Schemas

- Updated all 4 template schemas with network enums
- Added examples for both EVM and Solana addresses
- Clarified that payment addresses can be shared across multiple agents
- Identity template now explains that PRIVATE_KEY is for developer's EVM wallet (identity registration), separate from PAYMENTS_RECEIVABLE_ADDRESS

## Testing

- Added Solana payment tests for Hono adapter (6 tests)
- Added Solana payment tests for TanStack adapter (6 tests)
- Added core runtime Solana configuration tests (2 tests)
- Network validation tests verify unsupported networks are rejected
- All 114 tests passing

## Bug Fixes

- Fixed CI workflow to run on `master` branch instead of `main`
- Fixed 4 CLI tests using outdated adapter names (`tanstack` → `tanstack-ui`)
- Fixed test prompt mock to handle network selection dropdown

## Notes

### Network Names

The correct Solana network identifiers per x402 specification are:
- `solana` - Mainnet (NOT `solana-mainnet`)
- `solana-devnet` - Devnet
- `solana-mainnet` - Does not exist in x402
- `solana-testnet` - Does not exist in x402

### Architecture Clarifications

- **Developer wallet (PRIVATE_KEY)**: EVM wallet used for identity registration and deployment
- **Payment receiving address**: Can be EVM or Solana, used to receive payments at entrypoints
- **Agent's own wallet**: Future work (for reputation, validation, agent-to-agent calls)
- Payment addresses can be shared across multiple agents deployed by the same developer

Closes #11

