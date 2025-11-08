# {{APP_NAME}}

This project is generated with the TanStack Start template from `@lucid-agents/create-agent-kit`. It bundles a React app, SSR server routes, and an agent powered by `@lucid-agents/agent-core` in a single process.

## Getting Started

1. Install dependencies:

   ```bash
   bun install
   ```

2. Configure environment variables:

   ```bash
   cp .env.example .env
   # Edit the WalletConnect project id
   ```

3. Run the app:

   ```bash
   bun run dev
   ```

   The TanStack Start dev server listens on <http://localhost:3000> and exposes the agent under `/api/agent/*` routes.

## Scripts

- `bun run dev` – Start the TanStack Start dev server
- `bun run build` – Build the server output and run type-checks
- `bun run start` – Serve the production build
- `bun run type-check` – Run TypeScript without emitting files

## Agent Overview

The scaffold registers two entrypoints:

- `{{ENTRYPOINT_KEY}}` – echoes the provided text{{ENTRYPOINT_PRICE_NOTE}}
- `count` – streams numbers up to the requested limit

If you enabled x402 payments during scaffolding, the template wires payment validation into both invoke and stream routes. Update the price or add additional entrypoints in `src/lib/agent.ts`.

## WalletConnect / Reown

The UI integrates [`@reown/appkit`](https://reown.com/) for wallet connections. Set `VITE_WALLET_CONNECT_PROJECT_ID` in `.env` to enable the modal. Remove the AppKit provider from `src/components/AppkitProvider.tsx` if you don't need wallet features.

## Testing

The template includes a Bun test in `tests/agent.test.ts` that exercises both invoke and stream flows. Run it with:

```bash
bun test
```
