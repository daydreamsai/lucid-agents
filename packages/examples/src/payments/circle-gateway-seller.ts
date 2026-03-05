/**
 * Circle Gateway Seller Example
 *
 * A Lucid agent that accepts gasless x402 payments via Circle Gateway.
 * Buyers pay from their Circle Gateway balance — no ETH/gas required.
 *
 * ## Setup
 *
 * 1. Install the optional peer dependency:
 *    ```bash
 *    npm install @circle-fin/x402-batching
 *    ```
 *
 * 2. Set environment variables:
 *    ```bash
 *    CIRCLE_GATEWAY_FACILITATOR=true   # activate Circle Gateway settlement
 *    PAYMENTS_RECEIVABLE_ADDRESS=0x…   # your wallet to receive USDC
 *    PAYMENTS_NETWORK=eip155:8453      # Base mainnet
 *    ```
 *
 * 3. Run:
 *    ```bash
 *    bun run packages/examples/src/payments/circle-gateway-seller.ts
 *    ```
 *
 * ## Buyer Flow
 *
 * Buyers use `createGatewayFetch` or `GatewayClient.pay()` from
 * `@circle-fin/x402-batching/client` to pay automatically.
 *
 * @see https://developers.circle.com/gateway/nanopayments
 * @see https://github.com/daydreamsai/lucid-agents/issues/223
 */

import { createDreams, defineEntrypoint } from '@lucid-agents/core';
import {
  payments,
  paymentsFromEnv,
  createCircleGatewayFacilitator,
  depositToGateway,
  createGatewayFetch,
} from '@lucid-agents/payments';

// ─── Seller Agent ────────────────────────────────────────────────────────────

const agent = createDreams({
  extensions: [
    payments({
      config: paymentsFromEnv({
        // Activate Circle Gateway settlement.
        // Also reads CIRCLE_GATEWAY_FACILITATOR=true from env.
        facilitator: 'circle-gateway',
        circleGateway: {
          gatewayUrl: process.env.CIRCLE_GATEWAY_URL ?? 'https://gateway.circle.com',
        },
      }),
    }),
  ],
  entrypoints: [
    defineEntrypoint({
      key: 'greet',
      // $0.01 per call — paid via Circle Gateway (gasless for buyers)
      price: '0.01',
      schema: { input: { type: 'string' } },
      async invoke({ input }: { input: string }) {
        return { greeting: `Hello, ${input}! Payment received via Circle Gateway.` };
      },
    }),
    defineEntrypoint({
      key: 'summarize',
      price: '0.05',
      schema: { input: { type: 'string' } },
      async invoke({ input }: { input: string }) {
        return {
          summary: `Summary of "${input}" — generated after successful Circle Gateway payment.`,
        };
      },
    }),
  ],
});

// ─── Circle Gateway Facilitator (standalone) ──────────────────────────────────

// You can also use the facilitator directly for custom settlement logic:
const facilitator = createCircleGatewayFacilitator({
  gatewayUrl: 'https://gateway.circle.com',
});
console.log('Facilitator URL:', facilitator.gatewayUrl);

// ─── Buyer helpers (for testing) ─────────────────────────────────────────────

// Deposit USDC to Gateway so you can make gasless payments (run once):
async function setupBuyer() {
  const PRIVATE_KEY = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!PRIVATE_KEY) {
    console.log('Set BUYER_PRIVATE_KEY to run buyer deposit example.');
    return;
  }

  // Deposit $10 into Circle Gateway on Base
  const deposit = await depositToGateway('10', 'base', PRIVATE_KEY);
  console.log('Deposited:', deposit.formattedAmount, 'USDC, tx:', deposit.depositTxHash);

  // Create a payment-enabled fetch for making calls to the seller
  const gatewayFetch = createGatewayFetch({
    privateKey: PRIVATE_KEY,
    chain: 'base',
  });

  // Call the seller agent — 402 is handled automatically
  const response = await gatewayFetch('http://localhost:3000/greet', {
    method: 'POST',
    body: JSON.stringify({ input: 'World' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json();
  console.log('Response:', data);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting Circle Gateway seller agent...');
  console.log('Circle Gateway facilitator active:', facilitator.gatewayUrl);

  // Demo: show buyer flow if BUYER_PRIVATE_KEY is set
  if (process.env.BUYER_PRIVATE_KEY) {
    await setupBuyer();
  }

  // Start the agent
  await agent.start();
  console.log('Agent started. Accepting gasless payments via Circle Gateway.');
}

main().catch(console.error);
