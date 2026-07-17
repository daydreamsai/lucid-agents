# Kitchen-Sink Example

Demonstrates all major Lucid Agents SDK capabilities in a single runnable project — two agents working together.

## What It Shows

| Module      | Capability demonstrated                             |
| ----------- | --------------------------------------------------- |
| `wallet`    | Local signing plus optional environment wallet      |
| `identity`  | Trust/OASF discovery and optional ERC-8004 identity |
| `payments`  | Free, x402/SIWX, and MPP deterministic profiles     |
| `analytics` | Payment summary via `analytics-report` entrypoint   |
| `scheduler` | Leased invocation of a live local agent             |
| `catalog`   | YAML and CSV generated entrypoints                  |
| `a2a`       | Agent card + task-based inter-agent calls           |
| `ap2`       | AP2 extension in agent manifest                     |
| `hono`      | HTTP adapter serving all entrypoints                |

Two agents run side-by-side:

- **Kitchen-sink agent** (port 8787) — all capabilities
- **Client agent** (port 8788) — discovers and calls the kitchen-sink via A2A on startup

## Quickstart (no wallet required)

```bash
bun install
bun run packages/examples/src/kitchen-sink/index.ts
```

The default executable is free and requires no external services. Paid protocol
profiles are exercised by deterministic local facilitators and verifiers in the
E2E suite.

## With Wallet (enables environment-backed identity)

```bash
export AGENT_WALLET_TYPE=local
export AGENT_WALLET_PRIVATE_KEY=0x<your-key>
export PAYMENTS_RECEIVABLE_ADDRESS=0x<your-address>
bun run packages/examples/src/kitchen-sink/index.ts
```

## Environment Variables

| Variable                      | Default                           | Description                  |
| ----------------------------- | --------------------------------- | ---------------------------- |
| `AGENT_WALLET_TYPE`           | —                                 | `local` to enable wallet     |
| `AGENT_WALLET_PRIVATE_KEY`    | —                                 | 0x-prefixed private key      |
| `AGENT_DOMAIN`                | —                                 | ERC-8004 domain for identity |
| `AUTO_REGISTER`               | `false`                           | Register identity on startup |
| `FACILITATOR_URL`             | `https://facilitator.example.com` | Offline demo facilitator URL |
| `PAYMENTS_RECEIVABLE_ADDRESS` | `0x0000…0001`                     | Address to receive payments  |
| `NETWORK`                     | `eip155:84532`                    | CAIP-2 network identifier    |
| `PORT`                        | `8787`                            | Kitchen-sink server port     |
| `CLIENT_PORT`                 | `8788`                            | Client agent server port     |

## Endpoints

```
POST /entrypoints/echo/invoke              free        Echo text with timestamp
POST /entrypoints/summarize/invoke         free*       Word/char count + preview
POST /entrypoints/stream/stream            free        Stream characters via SSE
POST /entrypoints/analytics-report/invoke  free        Payment summary
POST /entrypoints/scheduler-status/invoke  free        Active scheduled jobs
POST /entrypoints/ask/invoke               free*       Ask Claude a question (requires ANTHROPIC_API_KEY)
GET  /.well-known/agent-card.json          free        A2A agent card
```

## Example Calls

```bash
# Echo (free)
curl http://localhost:8787/entrypoints/echo/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"hello world"}}'

# Summarize (free in the default executable; paid in x402/MPP test profiles)
curl http://localhost:8787/entrypoints/summarize/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"The quick brown fox jumps over the lazy dog"}}'

# Analytics report
curl http://localhost:8787/entrypoints/analytics-report/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{}}'

# Scheduler status
curl http://localhost:8787/entrypoints/scheduler-status/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{}}'

# Ask Claude (requires ANTHROPIC_API_KEY)
curl http://localhost:8787/entrypoints/ask/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"question":"What is the Lucid Agents SDK?"}}'

# Agent card (A2A discovery)
curl http://localhost:8787/.well-known/agent-card.json | jq .
```

## Running Tests

```bash
bun test packages/examples/src/kitchen-sink/__tests__
```

The suite boots the actual executable, crosses real TCP boundaries, and covers
x402 settlement, SIWX entitlements, MPP credentials, analytics, scheduler
execution, YAML/CSV catalogs, local wallet signing, identity/OASF discovery,
streaming, and owned A2A tasks.

## File Structure

```
src/kitchen-sink/
├── agent.ts          # Agent factory — all 8 extensions
├── entrypoints.ts    # 6 entrypoints (echo, summarize, stream, analytics, scheduler, ask)
├── client.ts         # Client agent — discovers & calls via A2A
├── index.ts          # Startup — boots both agents, prints curl guide
├── fixtures/         # Deterministic YAML and CSV catalog data
└── __tests__/
    ├── agent.test.ts          # Factory: extensions present
    ├── entrypoints.test.ts    # Handlers: correct output shapes
    ├── a2a.test.ts            # In-process A2A integration
    ├── process.e2e.test.ts    # Executable HTTP/SSE/tasks over TCP
    ├── protocols.e2e.test.ts  # x402, SIWX, MPP, analytics
    └── stateful.e2e.test.ts   # Scheduler, catalogs, wallet, identity
```
