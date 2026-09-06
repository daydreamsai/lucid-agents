# @lucid-agents/keeperhub

KeeperHub as the execution layer behind Lucid entrypoints. An agent sells onchain
payouts and standing orders; the buyer's payment settles only when KeeperHub's
receipt is verified.

## Install

```bash
bun add @lucid-agents/keeperhub @lucid-agents/core @lucid-agents/http
```

## Use

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import {
  keeperhub,
  keeperhubDryRunEntrypoint,
  keeperhubScheduleEntrypoint,
  keeperhubStatusEntrypoint,
  keeperhubTransferEntrypoint,
  keeperhubWatchEntrypoint,
} from '@lucid-agents/keeperhub';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia

const runtime = await createAgent({ name: 'treasury', version: '1.0.0' })
  .use(
    keeperhub({
      apiKey: process.env.KEEPERHUB_API_KEY!,
      policy: { chains: ['base-sepolia'], tokens: [USDC], maxAmount: '5' },
    })
  )
  .use(http())
  .build();

runtime.entrypoints.add(
  keeperhubTransferEntrypoint({
    key: 'payout',
    chainId: 'base-sepolia',
    tokenAddress: USDC,
  })
);
runtime.entrypoints.add(
  keeperhubScheduleEntrypoint({
    key: 'subscribe',
    chainId: 'base-sepolia',
    tokenAddress: USDC,
  })
);
runtime.entrypoints.add(
  keeperhubDryRunEntrypoint({
    key: 'dry-run',
    chainId: 'base-sepolia',
    tokenAddress: USDC,
  })
);
runtime.entrypoints.add(keeperhubStatusEntrypoint());
runtime.entrypoints.add(keeperhubWatchEntrypoint());
```

Add `price: '0.01'` to a factory and install `payments()` to sell it. The handler
throws on anything short of a verified receipt, so a priced call is never
settled for a transaction that did not land.

## What it does

- Policy gate (chains, tokens, recipients, maximum amount) evaluated before any
  KeeperHub call.
- Simulate with the exact body, broadcast the same body under
  `sha256(reference|chainId|recipient|amount|token)` (KeeperHub's documented
  canonical key), poll honouring `X-Poll-Interval-Hint`, and treat
  `receipts[].verified` with `receiptStatus === "success"` as the only proof.
- `409 idempotency_in_progress`, `409 idempotency_conflict`, `429`, `5xx` and
  `unconfirmed` handled the way KeeperHub documents them; `unconfirmed` is
  reported as unknown, never as failed.
- Agent-authored workflows (`POST /api/workflows/create`, Schedule trigger →
  transfer) for standing orders, one workflow per reference.
- Execution log with subscriptions, an SSE `watch` stream, and an agent-card
  capability descriptor (`urn:landed:keeperhub-execution:v1`).
- `createMockKeeperHub()` for tests and offline demos.

See the docs page for the runtime API and the error contract.
