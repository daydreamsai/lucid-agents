# Examples

This package contains example implementations demonstrating how to use the lucid-agents framework.

## Structure

- `src/core/` - Core framework examples (HTTP, payments, identity, streaming)
- `src/identity/` - ERC-8004 identity examples
- `src/a2a/` - Agent-to-Agent protocol examples
- `src/payments/trust-gated-payment.ts` - Screen a counterparty for risk (vendor-neutral `CounterpartyScreener` seam, with both a `PaladinScreener` OFAC wallet-screen impl and an offline `LocalDenylistScreener`) before sending an x402 payment, fail-closed by default. Run the full gate offline (stubbed payment leg):

  ```bash
  bun run packages/examples/src/payments/trust-gated-payment.ts
  # One-shot live OFAC screen of an address:
  bun run packages/examples/src/payments/trust-gated-payment.ts --screen 0x0000000000000000000000000000000000000000
  ```

  Environment variables:
  - `SCREENER_URL` - Screener endpoint (default: PaladinFi free OFAC wallet screen)
  - `FAIL_OPEN` - `"true"` to proceed on screener failure (default: `false` = fail-closed)
  - `PORT` - Server port (default: 3000)

## Running Examples

Examples can be run directly with Bun:

```bash
# From the examples package
bun run src/core/full-agent.ts

# Or from the repo root
bun run packages/examples/src/core/full-agent.ts
```

## Type Checking

All examples are type-checked:

```bash
bun run type-check
```

## Linting

Lint examples:

```bash
bun run lint
bun run lint:fix
```
