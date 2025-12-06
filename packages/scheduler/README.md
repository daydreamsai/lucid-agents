# @lucid-agents/scheduler

Pull-style scheduler for hiring agents via their `agent-card.json`, binding a wallet for payment, and invoking entrypoints on a schedule.

## Usage

```ts
import {
  createMemoryStore,
  createSchedulerRuntime,
  createSchedulerWorker,
} from '@lucid-agents/scheduler';

const runtime = createSchedulerRuntime({
  store: createMemoryStore(),
  invoke: async ({ manifest, entrypointKey, input, wallet }) => {
    // Bridge into your agent runtime: resolve entrypoint and charge via the bound wallet.
    console.log(`Invoke ${entrypointKey} on ${manifest.name} using ${wallet.address}`, input);
  },
});

const { hire } = await runtime.createHire({
  agentCardUrl: 'https://agent.example.com',
  wallet: { walletId: 'w1', network: 'base', address: '0xabc' },
  entrypointKey: 'daily-report',
  schedule: { kind: 'interval', everyMs: 86_400_000 },
  jobInput: { userId: 'u1' },
});

await runtime.addJob({
  hireId: hire.id,
  entrypointKey: 'hourly-sync',
  schedule: { kind: 'once', at: Date.now() + 30_000 },
  jobInput: { accountId: 'acct-123' },
});

const worker = createSchedulerWorker(runtime, 5_000);
worker.start();
```

Notes:
- Agent discovery uses `.well-known/agent-card.json` (with fallbacks) and caches the card per hire.
- Wallet bindings ride along each invocation so payments/x402 can charge that wallet.
- Supported schedules: `interval` and `once` (cron parsing is not implemented yet).
