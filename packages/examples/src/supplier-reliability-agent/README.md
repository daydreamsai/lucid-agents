# Supplier Reliability Agent Example

This agent provides a mock supplier reliability scoring service, fulfilling the requirements for bounty issue #181.

## What It Shows

-   A paid data agent for B2B data services.
-   Deterministic mock data generation for predictable testing.

## Entrypoints

### `score`

Provides a reliability score for a given `supplierId`.

-   **Input**: `supplierId` (string)
-   **Output**:
    -   `score` (number)
    -   `grade` (string: A-F)
    -   `riskFactors` (array of strings)
-   **Price**: $0.0003 USDC

## How to Run

1.  Set payment environment variables (e.g., `PAYMENTS_RECEIVABLE_ADDRESS`).
2.  Run the agent from the monorepo root:
    ```bash
    bun run packages/examples/src/supplier-reliability-agent/index.ts
    ```
3.  Invoke the endpoint:
    ```bash
    # This will return a 402 without a payment header
    curl http://localhost:8787/entrypoints/score/invoke \
         -H 'Content-Type: application/json' \
         -d '{"input":{"supplierId":"acme-corp"}}'
    ```
