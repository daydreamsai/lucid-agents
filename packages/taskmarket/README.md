# @lucid-agents/taskmarket

Authorization-gated Taskmarket requester toolkit. A Lucid agent can preview,
fund, and review Taskmarket work from inside the runtime. It never silently
accepts or rejects submissions, never stores keys, and never retries a payment
whose settlement status is unknown.

## Safety rules

- Show the exact description, reward, deadline, deliverables, Base network, and
  maximum spend before any paid call.
- Require a fresh `{ confirmed: true, previewId }` authorization that matches
  the issued preview.
- Pay only canonical USDC on Base (`eip155:8453` /
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- Send one x402 payment per idempotency key. If settlement is unknown, poll
  `GET /api/intents` instead of paying again.
- Present submissions for human review. Accept and reject are separate
  authorized paid calls.

This package does not wrap `fetch` with automatic x402 payment. Automatic
payment would skip the confirmation and spending checks.

## Install

```bash
bun add @lucid-agents/taskmarket @lucid-agents/core viem
```

Provide a wallet account from `@lucid-agents/wallet` or a viem LocalAccount.
Do not pass a private key into this package.

## Usage

```ts
import { createAgent } from '@lucid-agents/core';
import { taskmarket } from '@lucid-agents/taskmarket';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(
  process.env.TASKMARKET_ACCOUNT_KEY as `0x${string}`
);

const runtime = await createAgent({ name: 'requester', version: '1.0.0' })
  .use(taskmarket({ account }))
  .build();

const preview = runtime.taskmarket.previewCreate({
  description: 'Summarize the weekly onchain report',
  rewardUsdc: '1.5',
  durationHours: 24,
  tags: ['research'],
  deliverables: 'One markdown file, 400-800 words',
});

console.log({
  description: preview.description,
  reward: `${preview.rewardUsdc} USDC`,
  deadline: preview.deadlineIso,
  deliverables: preview.deliverables,
  network: preview.network,
  maxSpend: `${preview.maxSpendUsdc} USDC`,
});

const created = await runtime.taskmarket.createTask(preview, {
  previewId: preview.previewId,
  confirmed: true,
});

const status = await runtime.taskmarket.getTask(created.taskId);
const submissions = await runtime.taskmarket.listSubmissions(created.taskId);
```

Accepting still requires a second preview and confirmation:

```ts
const acceptPreview = runtime.taskmarket.previewAccept({
  taskId: created.taskId,
  workerAddress: submissions[0].workerAddress,
});
await runtime.taskmarket.acceptSubmission(acceptPreview, {
  previewId: acceptPreview.previewId,
  confirmed: true,
});
```

## Tests

```bash
bun test packages/taskmarket
```
