# Data Freshness Agent Example

This agent provides a data freshness and provenance checking service, fulfilling the requirements for bounty issue #184.

## What It Shows

-   A paid data agent that performs a real HTTP `HEAD` request to check resource freshness.
-   Parsing of `Cache-Control` and `Last-Modified` headers.

## Entrypoints

### `freshness`

Checks the freshness of a given URL.

-   **Input**: `url` (string)
-   **Output**:
    -   `slaStatus` ('fresh', 'stale', 'unknown')
    -   `stalenessMs` (number)
    -   `confidence` (number)
-   **Price**: $0.0003 USDC

## How to Run

1.  Set payment environment variables (e.g., `PAYMENTS_RECEIVABLE_ADDRESS`).
2.  Run the agent:
    ```bash
    bun run packages/examples/src/data-freshness-agent/index.ts
    ```
3.  Invoke the endpoint:
    ```bash
    # This will return a 402 without a payment header
    curl http://localhost:8787/entrypoints/freshness/invoke \
         -H 'Content-Type: application/json' \
         -d '{"input":{"url":"https://daydreams.ai"}}'
    ```
