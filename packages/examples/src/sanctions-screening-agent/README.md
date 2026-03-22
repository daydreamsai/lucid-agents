# Sanctions Screening Agent Example

This agent provides a mock compliance screening service, fulfilling the requirements for bounty issue #185.

## What It Shows

-   A paid data agent with a single `screen` entrypoint.
-   How to structure a simple, focused agent within the Lucid monorepo.
-   Deterministic mock data generation for predictable testing.

## Entrypoints

### `screen`

Screens a given name or address against mock sanctions and Politically Exposed Persons (PEP) lists.

-   **Input**:
    -   `name` (string, optional)
    -   `address` (string, optional)
-   **Output**:
    -   `isSanctioned` (boolean)
    -   `isPEP` (boolean)
    -   `matchConfidence` (number)
    -   `listsChecked` (array of strings)
-   **Price**: $0.0003 USDC

## How to Run

1.  Ensure you have the necessary environment variables for payments set (e.g., `PAYMENTS_RECEIVABLE_ADDRESS`).
2.  From the root of the `lucid-agents` monorepo, run:
    ```bash
    bun run packages/examples/src/sanctions-screening-agent/index.ts
    ```
3.  Invoke the endpoint:
    ```bash
    curl http://localhost:8787/entrypoints/screen/invoke \
         -H 'Content-Type: application/json' \
         -d '{"input":{"name":"John Doe"}}'
    ```
