# Kitchen-Sink Example Design

> Date: 2026-02-23 | Task: [Taskmarket #0x910ad45e...](https://taskmarket.daydreams.systems)

## Overview

A comprehensive example demonstrating all major Lucid Agents SDK capabilities in a
single runnable TypeScript project. Two agents run side-by-side: a feature-rich
kitchen-sink server and a client agent that calls it via A2A, together covering every
major SDK module.

---

## Location

```
packages/examples/src/kitchen-sink/
├── agent.ts           # Agent factory — all extensions wired
├── entrypoints.ts     # All entrypoints (free, paid, streaming, analytics, scheduler)
├── client.ts          # Client agent — discovers & calls kitchen-sink via A2A
├── index.ts           # Startup — boots both agents, prints curl cheatsheet
├── README.md          # Setup & walkthrough
└── __tests__/
    ├── agent.test.ts        # Extension presence
    ├── entrypoints.test.ts  # Handler output shapes
    └── a2a.test.ts          # Client → kitchen-sink A2A call
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Kitchen-Sink Agent  (port 8787)            │
│                                             │
│  Extensions:                                │
│    http · wallet · identity · payments      │
│    analytics · scheduler · a2a · ap2        │
│                                             │
│  Entrypoints:                               │
│    echo            free    basic HTTP       │
│    summarize       0.001 USDC  x402         │
│    stream          free    streaming        │
│    analytics-report free   analytics query  │
│    scheduler-status free   active jobs      │
└───────────────────┬─────────────────────────┘
                    │ A2A (task-based)
┌───────────────────▼─────────────────────────┐
│  Client Agent  (port 8788)                  │
│                                             │
│  Extensions: a2a                            │
│                                             │
│  On startup: discovers kitchen-sink card,   │
│  calls echo via A2A, prints result          │
└─────────────────────────────────────────────┘
```

---

## Main Agent — Extensions

| Extension   | Config source          | Notes                                     |
|-------------|------------------------|-------------------------------------------|
| `http`      | —                      | Required base for Hono                    |
| `wallet`    | `PRIVATE_KEY` env      | Local wallet; used by identity + payments |
| `identity`  | `AGENT_DOMAIN` env     | ERC-8004, autoRegister=true, Base Sepolia |
| `payments`  | `PRIVATE_KEY` + env    | x402, USDC, facilitator from env          |
| `analytics` | —                      | Tracks all payment transactions           |
| `scheduler` | —                      | In-memory store; periodic heartbeat job   |
| `a2a`       | —                      | Agent card + task-based invocation        |
| `ap2`       | roles: `['assistant']` | AP2 extension in agent manifest           |

All extensions are optional-safe: if env vars are missing the agent still starts
(identity/payments skip registration; analytics/scheduler run with empty state).

---

## Entrypoints

### `echo` (free)
- Input: `{ text: string }`
- Output: `{ text: string, timestamp: string }`
- Demonstrates: basic HTTP handler

### `summarize` (0.001 USDC via x402)
- Input: `{ text: string }`
- Output: `{ wordCount: number, charCount: number, preview: string }`
- Demonstrates: paid entrypoint, x402 payment flow

### `stream` (free, streaming)
- Input: `{ prompt: string }`
- Output: streaming deltas, one character at a time
- Demonstrates: streaming entrypoint with `emit`

### `analytics-report` (free)
- Input: `{ windowHours?: number }` (default 24)
- Output: `{ outgoingTotal, incomingTotal, netTotal, transactionCount }`
- Demonstrates: analytics query from entrypoint handler

### `scheduler-status` (free)
- Input: `{}`
- Output: `{ jobs: Array<{ id, schedule, lastRun, nextRun }> }`
- Demonstrates: reading scheduler state from handler

---

## Client Agent

- Runs on port 8788 with the `a2a` extension only
- On startup:
  1. Fetches `http://localhost:8787/.well-known/agent-card.json`
  2. Checks capabilities (streaming, payments)
  3. Finds `echo` skill via `findSkill`
  4. Sends A2A message → waits for task completion → prints result
- Stays alive after demo so it can be called by further agents

---

## Environment Variables

```env
# Required for wallet/identity/payments
PRIVATE_KEY=0x...                          # Agent wallet private key

# Optional — defaults shown
AGENT_DOMAIN=kitchen-sink.example.com      # ERC-8004 domain
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_RECEIVABLE_ADDRESS=0x...          # Defaults to wallet address
NETWORK=base-sepolia
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
PORT=8787
CLIENT_PORT=8788
```

---

## Testing Strategy (TDD)

Tests are written first; implementation makes them pass.

### `agent.test.ts`
- Builds agent with mock env; asserts `runtime.a2a`, `runtime.analytics`,
  `runtime.scheduler`, `runtime.wallets` are defined

### `entrypoints.test.ts`
- Calls each handler function directly (no HTTP); asserts output shape matches schema
- `echo` returns `{ text, timestamp }`
- `summarize` returns `{ wordCount, charCount, preview }`
- `analytics-report` returns summary object
- `scheduler-status` returns `{ jobs: [] }` on fresh start

### `a2a.test.ts`
- Starts both agents on ephemeral ports
- Client fetches agent card, calls `echo` via A2A
- Asserts task completes with `status === 'completed'` and correct output
- Tears down servers after test

---

## Startup Output

```
[kitchen-sink] ─────────────────────────────────────
[kitchen-sink] Wallet:     0xABC...
[kitchen-sink] Identity:   registered (agent-42) | skipped (no PRIVATE_KEY)
[kitchen-sink] Payments:   x402 enabled | disabled
[kitchen-sink] Analytics:  ready
[kitchen-sink] Scheduler:  heartbeat job every 30s
[kitchen-sink] A2A:        ready
[kitchen-sink] AP2:        roles: assistant
[kitchen-sink] Server:     http://localhost:8787
[kitchen-sink] ─────────────────────────────────────
[kitchen-sink] Try it:
[kitchen-sink]   curl http://localhost:8787/entrypoints/echo/invoke \
                   -d '{"input":{"text":"hello"}}'
[kitchen-sink]   curl http://localhost:8787/.well-known/agent-card.json
[kitchen-sink] ─────────────────────────────────────
[client]       Fetching kitchen-sink agent card...
[client]       Calling echo via A2A...
[client]       Result: { text: 'hello', timestamp: '...' }
[client]       Server: http://localhost:8788
```

---

## Success Criteria

- [ ] `bun run packages/examples/src/kitchen-sink/index.ts` starts without errors
- [ ] All 3 test files pass with `bun test`
- [ ] Agent card at `/.well-known/agent-card.json` includes a2a, ap2, payments capabilities
- [ ] `echo` entrypoint responds correctly
- [ ] `summarize` entrypoint is listed with a price in the agent card
- [ ] Client agent completes an A2A task against the kitchen-sink
- [ ] No TypeScript errors (`bun run type-check`)
- [ ] Passes linting (`bun run lint`)
