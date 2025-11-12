# Next.js Adapter Base Layer

This adapter scaffolds a full-stack Next.js agent shell with:

- App Router layout and API routes under `app/api/agent/*`
- Reown AppKit wallet modal wired to Wagmi + Solana adapters
- Dashboard UI for invoking entrypoints, inspecting manifests, and monitoring health
- `x402-next` middleware for paywalled invoke/stream routes
- Session token API (`/api/x402/session-token`) for optional Coinbase Onramp flows

## Files of Interest

- `lib/agent.ts` – Generated at scaffold time with your entrypoints
- `app/api/agent/*` – HTTP endpoints backed by agent runtime handlers
- `proxy.ts` – x402 paywall powered by `x402-next`
- `components/dashboard.tsx` – Client dashboard for testing entrypoints
- `lib/paywall.ts` – Builds dynamic route pricing for the middleware

Update `.env` with:

```bash
NEXT_PUBLIC_PROJECT_ID=your_wallet_connect_id
PAYMENTS_RECEIVABLE_ADDRESS=0x...
PAYMENTS_NETWORK=base-sepolia
PAYMENTS_DEFAULT_PRICE=0.1
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
```

Run locally:

```bash
bun install
bun run dev
```

## Optional Coinbase Onramp

Set `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` and call the provided `/api/x402/session-token` route to surface the "Get more USDC" button inside the paywall.
