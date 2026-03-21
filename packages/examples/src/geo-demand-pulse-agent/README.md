# Geo Demand Pulse Agent Example

This agent provides a mock geo-demand pulse service, fulfilling the requirements for bounty issue #182.

## What It Shows

-   A paid data agent for location-based data services.
-   Deterministic mock data generation for predictable testing.

## Entrypoints

### `pulse`

Provides a demand pulse index for a given latitude and longitude.

-   **Input**: `latitude` (number), `longitude` (number)
-   **Output**:
    -   `index` (number)
    -   `velocity` (string)
    -   `confidence` (number)
-   **Price**: $0.0003 USDC

## How to Run

1.  Set payment environment variables (e.g., `PAYMENTS_RECEIVABLE_ADDRESS`).
2.  Run the agent from the monorepo root:
    ```bash
    bun run packages/examples/src/geo-demand-pulse-agent/index.ts
    ```
3.  Invoke the endpoint:
    ```bash
    # This will return a 402 without a payment header
    curl http://localhost:8787/entrypoints/pulse/invoke \
         -H 'Content-Type: application/json' \
         -d '{"input":{"latitude":37.77,"longitude":-122.41}}'
    ```
