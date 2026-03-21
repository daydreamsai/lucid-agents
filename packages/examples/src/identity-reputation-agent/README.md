# Identity Reputation Agent Example

This agent provides a mock identity reputation service, fulfilling the requirements for bounty issue #183.

## What It Shows

-   A paid data agent for ERC-8004 identity reputation.
-   Deterministic mock data generation for predictable testing.

## Entrypoints

### `reputation`

Provides a reputation score for a given agent identity.

-   **Input**: `identity` (string) - e.g., "my-agent.example.com" or a wallet address.
-   **Output**:
    -   `trustScore` (number)
    -   `completionRate` (number)
    -   `disputeRate` (number)
-   **Price**: $0.0003 USDC

## How to Run

1.  Set payment environment variables (e.g., `PAYMENTS_RECEIVABLE_ADDRESS`).
2.  Run the agent from the monorepo root:
    ```bash
    bun run packages/examples/src/identity-reputation-agent/index.ts
    ```
3.  Invoke the endpoint:
    ```bash
    # This will return a 402 without a payment header
    curl http://localhost:8787/entrypoints/reputation/invoke \
         -H 'Content-Type: application/json' \
         -d '{"input":{"identity":"my-agent.example.com"}}'
    ```
