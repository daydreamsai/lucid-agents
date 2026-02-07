# Needs Review

Items that could not be resolved from source code alone and require owner input.

## W-15: "gpt-5" default model in createAxLLMClient

**File:** `packages/core/src/axllm/index.ts` (line 29)
**Also referenced in:** `packages/core/README.md` (line ~513)

The source code defines `const DEFAULT_MODEL = 'gpt-5'` and the docs state the client "falls back to gpt-5/OpenAI". The source code IS accurate to the docs, but `gpt-5` may be an intentional forward-looking default or a typo that should be `gpt-4o`.

**Action needed:** Confirm if `gpt-5` is intentional or should be changed to `gpt-4o` (in both source and docs).

## W-10: Cron scheduling status

**File:** `docs/ARCHITECTURE.md` (line 278) vs `packages/scheduler/README.md` (line 44)

Architecture doc says scheduler provides "Cron-like scheduling" but the scheduler README explicitly states "cron parsing is not implemented yet". Supported schedules are `interval` and `once` only.

**Action needed:** Clarify if cron is planned/in-progress or if ARCHITECTURE.md should be corrected.

## Architecture layer numbering inconsistency

**File:** `README.md` vs `docs/ARCHITECTURE.md`

The root README describes three layers:
1. Core (protocol-agnostic runtime)
2. Extensions (http, payments, wallets, identity, a2a, ap2)
3. Adapters (hono, tanstack, express, next)

The ARCHITECTURE.md may use a different numbering or grouping. These should be aligned.

**Action needed:** Confirm which layering model is canonical and update the other.

## W-8: Analytics `getSummary` API path

**File:** `README.md` (lines 376-377)

The analytics example calls `getSummary(agent.analytics.paymentTracker, 86400000)`. The `getSummary` function signature in `packages/analytics/src/api.ts` accepts `(paymentTracker: PaymentTracker, windowMs?: number)` which looks correct. However, `agent.analytics.paymentTracker` assumes the analytics extension exposes this property on the runtime.

**Action needed:** Verify that `agent.analytics.paymentTracker` is the correct path after building with `.use(analytics())`.
