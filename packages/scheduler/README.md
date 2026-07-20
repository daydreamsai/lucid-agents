# @lucid-agents/scheduler

A pull-style, lease-based scheduler for invoking remote Lucid services through
their Agent Cards and Lucid HTTP entrypoint profile. The package depends on
`@lucid-agents/a2a` helpers, but it is not an official A2A v1 scheduler.

## Runtime extension

The scheduler requires `a2a()`. Install `payments()` before it when scheduled
invocations may need x402 payment handling.

```ts
import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';
import {
  createMemoryStore,
  createSchedulerWorker,
  scheduler,
} from '@lucid-agents/scheduler';

const agent = await createAgent({ name: 'buyer', version: '1.0.0' })
  .use(wallets({ config: walletsFromEnv() }))
  .use(a2a())
  .use(payments({ config: paymentsFromEnv() }))
  .use(
    scheduler({
      store: createMemoryStore(),
      leaseMs: 30_000,
      defaultMaxRetries: 3,
      defaultConcurrency: 5,
    })
  )
  .build();

const { hire, job } = await agent.scheduler.createHire({
  agentCardUrl: 'https://worker.example',
  entrypointKey: 'daily-report',
  schedule: { kind: 'interval', everyMs: 86_400_000 },
  jobInput: { accountId: 'acct-123' },
});

const worker = createSchedulerWorker(agent.scheduler, 5_000);
worker.start();

// On shutdown:
worker.stop();
await agent.close();
```

If the buyer does not make paid calls, omit `payments()` entirely. The scheduler
uses `runtime.a2a.client.invoke` and automatically asks `runtime.payments` for a
payment-aware Fetch implementation when that capability exists. A paid buyer
also needs a compatible agent wallet/signer and spending policy; payments
configuration alone is not signing authority.

## Jobs and schedules

Supported schedules are:

```ts
{ kind: 'once', at: Date.now() + 30_000 }
{ kind: 'interval', everyMs: 60_000 }
```

Cron expressions are not supported. Use `addJob` to add work to an existing
hire, and `pauseHire`, `resumeHire`, `cancelHire`, `pauseJob`, or `resumeJob` for
lifecycle control.

```ts
await agent.scheduler.addJob({
  hireId: hire.id,
  entrypointKey: 'hourly-sync',
  schedule: { kind: 'once', at: Date.now() + 30_000 },
  jobInput: { accountId: 'acct-123' },
  maxRetries: 5,
});
```

Agent cards are cached per hire and refreshed after `agentCardTtlMs`. The card's
HTTP `supportedInterfaces` URL is used for invocation, including any base path.

## Delivery and idempotency

Workers claim jobs through `SchedulerStore.claimJob`. A lease makes concurrent
workers safe from intentionally executing the same due record at once, but a
worker can fail after the remote call and before it saves completion. Delivery
is therefore at least once.

Every job gets an idempotency seed unless the caller supplies one:

- retries of the same occurrence reuse the same key;
- every interval occurrence derives a distinct key from that seed, including
  caller-supplied seeds;
- one-time jobs use a caller-supplied key unchanged;
- seeds must contain 20–256 characters after trimming.

The key is sent as `Idempotency-Key` by the Lucid Agent Card/HTTP client. Lucid
HTTP runtimes deduplicate it by default; other remote services must provide an
equivalent target-side idempotency boundary.

Delivery remains at least once. A target-side idempotency record and
idempotent downstream effects are required because a worker can finish the
remote paid call and crash before it stores local success.

## Durable stores

`createMemoryStore()` is suitable for tests and one-process development. A
production scheduler should inject a durable implementation of `SchedulerStore`
from `@lucid-agents/types/scheduler`.

The critical store operation is an atomic `claimJob(jobId, workerId, leaseMs,
now)`. `recoverExpiredLeases()` returns expired leased jobs to pending state for
another worker. The extension calls an optional store `close()` method from
`runtime.close()`.

There is no lease heartbeat/renewal in this release. Set `leaseMs` longer than
the worst-case discovery, payment, invocation, and final store write. The
convenience worker does not call `recoverExpiredLeases()` automatically and can
start overlapping ticks if one tick exceeds its interval; orchestrate recovery
and rely on atomic claims.

For an externally managed worker loop, call:

```ts
await agent.scheduler.recoverExpiredLeases();
await agent.scheduler.tick({ workerId: 'worker-7', concurrency: 10 });
```

## Standalone construction

`createSchedulerRuntime` is available when an application already has a Lucid
runtime and wants to construct the scheduler without the extension helper:

```ts
import {
  createMemoryStore,
  createSchedulerRuntime,
} from '@lucid-agents/scheduler';

const schedulerRuntime = createSchedulerRuntime({
  runtime: agent,
  store: createMemoryStore(),
});
```

The supplied runtime must contain the A2A capability. Scheduler contracts are
defined in `@lucid-agents/types/scheduler`.
