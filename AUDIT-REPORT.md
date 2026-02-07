# Lucid Agents SDK - Documentation Audit Report

**Auditor:** sdk-auditor
**Date:** 2026-02-07
**Branch:** `frontboat/agent-team-review`
**Scope:** All documentation in the `lucid-agents` monorepo (READMEs, doc pages, JSDoc, code examples, lucid-docs site)

---

## Summary

The lucid-agents SDK has extensive documentation across 20+ README files, a docs site (`lucid-docs/`), architecture docs, and inline JSDoc. The documentation is generally well-structured and covers most features. However, the audit found **10 critical issues**, **16 warnings**, and **10 informational items**. The most significant problems are stale API references from the pre-refactor era (old `agent-kit` package names, removed functions like `configureAgentKit`), broken code examples with wrong variable names, and missing READMEs for 6 major packages.

---

## Critical Issues

### C-1: Core README documents non-existent APIs
**File:** `packages/core/README.md` (lines 297-322)
**Description:** The "Configuration & Environment" section documents `configureAgentKit(overrides)`, `getAgentKitConfig()`, and `resetAgentKitConfigForTesting()`. These functions do not exist anywhere in the `packages/core/src/` source tree. They appear to be holdovers from an older API that has been replaced by the builder pattern.

### C-2: Core README imports `paymentsFromEnv` from wrong package
**File:** `packages/core/README.md` (line 300)
**Description:** The code example imports `paymentsFromEnv` from `@lucid-agents/core`, but this function is only exported from `@lucid-agents/payments`. The correct import is:
```typescript
import { paymentsFromEnv } from '@lucid-agents/payments';
```

### C-3: Core README code examples use wrong variable names
**File:** `packages/core/README.md` (lines 90-118, 125-151, 155-185)
**Description:** All three adapter examples define the agent as `const agent = await createAgent({...}).use(http()).build()` but then pass a different variable name to the adapter:
- Hono example (line 103): `createAgentApp(runtime)` -- should be `createAgentApp(agent)`
- Express example (line 136): `createAgentApp(runtime)` -- should be `createAgentApp(agent)`
- TanStack example (line 169): `createTanStackRuntime(appRuntime)` -- should be `createTanStackRuntime(agent)`

### C-4: docs/PAYMENTS.md uses wrong property name `spendingLimits`
**File:** `docs/PAYMENTS.md` (throughout, lines 184-225, 250-306, etc.)
**Description:** The entire payments doc page uses `spendingLimits` as the policy config property name. The actual source code (`packages/payments/src/policy.ts`, `policy-schema.ts`, `policy-wrapper.ts`) uses `outgoingLimits`. This means all policy JSON examples in the doc are broken. The payments package README (`packages/payments/README.md`) correctly uses `outgoingLimits`.

### C-5: docs/PAYMENTS.md uses non-existent `agent.addEntrypoint()` API
**File:** `docs/PAYMENTS.md` (lines 500, 536)
**Description:** Examples call `agent.addEntrypoint({...})` directly on the runtime. After the builder pattern, the correct API is `agent.entrypoints.add({...})` or using the adapter's `addEntrypoint` helper (from `createAgentApp()`).

### C-6: Identity README imports `createAgentApp` from wrong package
**File:** `packages/identity/README.md` (line 106)
**Description:** The "Usage with Agent Kit" section imports `createAgentApp` from `@lucid-agents/core`, but this function is only exported by adapter packages (`@lucid-agents/hono`, `@lucid-agents/express`). It does not exist in `@lucid-agents/core`.

### C-7: Identity README uses old `createAgentApp(meta, options)` API signature
**File:** `packages/identity/README.md` (lines 115-123, 420-421)
**Description:** Two code examples use the old function signature: `createAgentApp({ name: 'my-agent', version: '1.0.0' }, { trust: trustConfig })`. The current API requires building a runtime first with `createAgent(meta).use(...).build()` and then passing the runtime to the adapter: `createAgentApp(runtime)`.

### C-8: Six major packages have no README
**Files (missing):**
- `packages/http/README.md` -- `@lucid-agents/http` (HTTP extension)
- `packages/wallet/README.md` -- `@lucid-agents/wallet` (Wallet SDK)
- `packages/hono/README.md` -- `@lucid-agents/hono` (Hono adapter)
- `packages/express/README.md` -- `@lucid-agents/express` (Express adapter)
- `packages/tanstack/README.md` -- `@lucid-agents/tanstack` (TanStack adapter)
- `packages/analytics/README.md` -- `@lucid-agents/analytics` (Payment analytics)

**Description:** The root README links to `packages/hono/README.md`, `packages/tanstack/README.md`, `packages/http/README.md`, `packages/wallet/README.md`, and `packages/analytics/README.md` -- all broken links. These are core packages that developers need documentation for.

### C-9: CONTRIBUTING.md uses entirely stale package names
**File:** `CONTRIBUTING.md` (lines 47-49, 74, 83, 92-98, 161, 189)
**Description:** The CONTRIBUTING.md refers to packages as `agent-kit`, `agent-kit-identity`, and `create-agent-kit` throughout. The actual package directory names are `core`, `identity`, and `cli`. The monorepo structure diagram is completely wrong.

### C-10: CONTRIBUTING.md has wrong Bun version requirement
**File:** `CONTRIBUTING.md` (line 19)
**Description:** States "**Bun** >= 20.9.0" as a prerequisite. Bun versions are 1.x (currently around 1.2.x). The value `20.9.0` appears to be copied from the Node.js engine requirement in `package.json` (`"node": ">=20.9.0"`).

---

## Warnings

### W-1: Core README broken link to identity docs
**File:** `packages/core/README.md` (line 449)
**Description:** Links to `../@lucid-agents/identity/README.md` which is an invalid filesystem path. Should be `../identity/README.md`.

### W-2: CONTRIBUTING.md uses wrong GitHub organization
**File:** `CONTRIBUTING.md` (line 28)
**Description:** Clone URL is `https://github.com/lucid-dreams-ai/lucid-agents.git`. The actual origin remote is `https://github.com/daydreamsai/lucid-agents.git`.

### W-3: Identity README uses wrong GitHub organization in links
**File:** `packages/identity/README.md` (lines 492-493)
**Description:** Links reference `https://github.com/lucid-dreams-ai/erc-8004-contracts` and `https://github.com/lucid-dreams-ai/lucid-fullstack/tree/main/packages/core`. The correct GitHub org appears to be `daydreamsai` (based on the git remote).

### W-4: Root README references `agent-card.json` manifest path but code uses both paths
**File:** `README.md` (line 155)
**Description:** The "Manifests" section says the manifest is at `.well-known/agent-card.json`, but the actual code (Hono adapter line 76-79) registers both `/.well-known/agent.json` AND `/.well-known/agent-card.json`. The curl examples in the Quick Start use `/.well-known/agent.json`. This inconsistency could confuse users.

### W-5: CLI README missing documentation for trading templates
**File:** `packages/cli/README.md`
**Description:** The CLI README lists templates: `blank`, `axllm`, `axllm-flow`, `identity`. But two additional templates exist: `trading-data-agent` and `trading-recommendation-agent` (mentioned in root README and present in `packages/cli/templates/`). These are undocumented in the CLI README.

### W-6: CLI README has broken markdown fencing
**File:** `packages/cli/README.md` (lines 179, 249-265)
**Description:** Line 179 has a 4-backtick fence (`````bash`) that breaks the markdown rendering. The "Identity Template" env vars section at lines 249-265 also has mismatched fences (````bash` with 4 backticks paired with regular 3-backtick close).

### W-7: Core README Solana example uses old `createAgentApp` API signature
**File:** `packages/core/README.md` (lines 211-237)
**Description:** The "Example with Solana" section uses the old `createAgentApp(meta, options)` signature that no longer exists. Should use the builder pattern.

### W-8: Root README analytics example may have wrong API usage
**File:** `README.md` (lines 376-377)
**Description:** The analytics example calls `getSummary(agent.analytics.paymentTracker, 86400000)`. The actual `getSummary` function in `packages/analytics/src/api.ts` accepts `(paymentTracker: PaymentTracker, windowMs?: number)` which looks correct, but `agent.analytics.paymentTracker` assumes the analytics runtime exposes this property. The analytics extension should be verified.

### W-9: Root README shows `@lucid-agents/agent-auth` import
**File:** `packages/core/README.md` (lines 356-394)
**Description:** The "Pricing" section shows an example importing from `@lucid-agents/agent-auth`. This package is not listed in the monorepo packages and is external (`@lucid-dreams/agent-auth` in core's package.json). The import path in the doc (`@lucid-agents/agent-auth`) does not match the actual dependency (`@lucid-dreams/agent-auth`).

### W-10: Architecture doc mentions "cron-like scheduling" but scheduler README says cron is not implemented
**File:** `docs/ARCHITECTURE.md` (line 278)
**Description:** Architecture doc says scheduler provides "Cron-like scheduling" but `packages/scheduler/README.md` (line 44) explicitly states "cron parsing is not implemented yet".

### W-11: Root README npm badge links to wrong scope
**File:** `README.md` (line 12)
**Description:** The npm badge links to `https://www.npmjs.com/package/@lucid-agents/cli` but the footer at line 703 links to `https://www.npmjs.com/org/lucid-agents`. These should be consistent and both should be verified as valid.

### W-12: Core README "Entrypoints" section describes HTTP-specific behavior
**File:** `packages/core/README.md` (lines 248-274)
**Description:** The core README states "Each entrypoint becomes two HTTP endpoints" but core is supposed to be protocol-agnostic. This HTTP behavior is provided by the HTTP extension and adapters, not core itself. The documentation blurs the line between core and HTTP extension.

### W-13: api-sdk README references `lucid-client` repo for API server
**File:** `packages/api-sdk/README.md` (line 3)
**Description:** References "Lucid Agents Runtime API" at `https://github.com/daydreamsai/lucid-client`. This is a cross-repo dependency -- the link and the server endpoints (`api-lucid-dev.daydreams.systems`) should be verified.

### W-14: docs/PAYMENTS.md `evaluateSpendingLimits` function not exported
**File:** `docs/PAYMENTS.md` (lines 462-466)
**Description:** The API reference documents `evaluateSpendingLimits(policyGroups, paymentInfo, spendingTracker?)` but this function is not exported from `packages/payments/src/index.ts`. The exported function is `evaluateOutgoingLimits`.

### W-15: Core README `createAxLLMClient` mentions wrong default model
**File:** `packages/core/README.md` (line 513)
**Description:** States the client "falls back to gpt-5/OpenAI". This should likely be `gpt-4o` or another current model name (gpt-5 does not exist as of this audit date).

### W-16: Root README missing `@lucid-agents/scheduler` from package list
**File:** `README.md` (lines 119-131)
**Description:** The "Packages" section lists 12 packages but omits `@lucid-agents/scheduler`, even though the scheduler package exists and is documented in the architecture docs.

---

## Informational

### I-1: Package `@lucid-agents/http` has no README at all
**File:** `packages/http/` (README.md missing)
**Description:** The HTTP extension is a critical package (required for all HTTP-based adapters) but has zero documentation. It only has a CHANGELOG.

### I-2: `lucid-docs/` site exists as a separate documentation site
**File:** `lucid-docs/content/docs/`
**Description:** A Fumadocs-based documentation site exists alongside the package READMEs. It covers getting-started, packages, concepts, examples, and migration guides. Some content may duplicate or conflict with package READMEs.

### I-3: Multiple AGENTS.md files exist for AI coding agents
**Files:** `AGENTS.md` (root), `packages/core/AGENTS.md`, and 6 template AGENTS.md files
**Description:** These files are designed for AI coding agents (Claude, Copilot, etc.) and contain SDK guidance. They are generally well-maintained but should be kept in sync with main docs.

### I-4: `@lucid-agents/eslint-config` and `@lucid-agents/prettier-config` have minimal READMEs
**Files:** `packages/eslint-config/README.md`, `packages/prettier-config/README.md`
**Description:** These are internal tooling packages. Their READMEs are minimal but adequate for their purpose.

### I-5: Examples package has a nested README structure
**Files:** `packages/examples/README.md`, `packages/examples/src/README.md`
**Description:** The outer README is minimal while the inner `src/README.md` has detailed information. This is unusual but functional.

### I-6: `@lucid-agents/api-sdk` is auto-generated
**File:** `packages/api-sdk/README.md`
**Description:** The SDK is auto-generated from an OpenAPI spec. Documentation quality depends on the spec being kept in sync with the server.

### I-7: No test instructions in root README Quick Start
**File:** `README.md`
**Description:** The Quick Start section tells users to run `bun run dev` but doesn't mention `bun test` or how to verify the installation worked beyond curl commands.

### I-8: Platform directory undocumented
**File:** `platform/`
**Description:** A `platform/` directory exists at the repo root but has no documentation and is not mentioned in any README.

### I-9: The `next` adapter is listed in CLI options but has limited documentation
**File:** `packages/cli/adapters/next/README.md`
**Description:** A Next.js adapter exists with a README in the CLI templates, but there is no dedicated `@lucid-agents/next` package in the packages directory. The Next.js integration appears to be template-only.

### I-10: Some CLI template READMEs reference specific template-generated files
**Files:** `packages/cli/templates/*/README.md`
**Description:** Template READMEs (6 total) are well-structured but are meant to be copied into generated projects, not read in-place.

---

## User Journey Assessment

**Question: "Can a new developer go from zero to a working agent using just these docs?"**

**Verdict: Partially -- with significant friction.**

**What works well:**
- The root README Quick Start is clear and actionable
- The `lucid-docs/` site quickstart page is clean and focused
- The CLI wizard handles most configuration automatically
- Package-level READMEs (where they exist) are thorough

**Where the journey breaks:**
1. **Missing adapter docs**: A developer choosing Hono, Express, or TanStack has no README to reference for those packages (C-8)
2. **Wrong code examples**: If a developer copies code from the core README, it will not compile due to wrong variable names (C-3) and non-existent imports (C-2)
3. **Stale CONTRIBUTING.md**: A contributor following the CONTRIBUTING.md will navigate to non-existent package directories (C-9)
4. **Broken policy examples**: Anyone trying to set up payment policies using docs/PAYMENTS.md will use wrong property names (C-4)
5. **Missing HTTP package docs**: The HTTP extension is required for all adapters but has zero documentation (I-1)
6. **Wallet docs only in /docs**: Wallet documentation exists only in `docs/WALLETS.md`, not as a package README. The root README links to a non-existent `packages/wallet/README.md`

**Recommendation**: Fix all critical issues (C-1 through C-10), add READMEs for the 6 missing packages, and ensure all code examples compile against the current API.

---

## Cross-Repo References

The following cross-repo references were found and communicated to relevant auditors:

| Reference | Source File | Target | Communicated To |
|-----------|------------|--------|-----------------|
| Lucid Runtime API | `packages/api-sdk/README.md` | `https://github.com/daydreamsai/lucid-client` | server-mcp-auditor, alignment-checker |
| API base URL | `packages/api-sdk/README.md` | `https://api-lucid-dev.daydreams.systems` | server-mcp-auditor, alignment-checker |
| Facilitator URL | Multiple docs | `https://facilitator.daydreams.systems` | server-mcp-auditor, alignment-checker |
| Agent Kit Documentation link | `packages/identity/README.md` | `https://github.com/lucid-dreams-ai/lucid-fullstack` | server-mcp-auditor, alignment-checker |
| xgate-mcp-server reference | `packages/identity/README.md` | xgate-mcp-server CDP pattern | server-mcp-auditor, alignment-checker |
| React Query integration | `packages/api-sdk/README.md` | `@lucid-agents/api-sdk/react-query` | client-auditor, alignment-checker |
| TanStack UI dashboard | `packages/cli/README.md` | TanStack adapter UI variant | client-auditor, alignment-checker |

---

## Files Audited

### README Files (23 total)
- `README.md` (root)
- `CONTRIBUTING.md`
- `packages/core/README.md`
- `packages/a2a/README.md`
- `packages/ap2/README.md`
- `packages/api-sdk/README.md`
- `packages/cli/README.md`
- `packages/cli/adapters/express/README.md`
- `packages/cli/adapters/hono/README.md`
- `packages/cli/adapters/next/README.md`
- `packages/cli/adapters/tanstack/README.md`
- `packages/cli/templates/axllm-flow/README.md`
- `packages/cli/templates/axllm/README.md`
- `packages/cli/templates/blank/README.md`
- `packages/cli/templates/identity/README.md`
- `packages/cli/templates/trading-data-agent/README.md`
- `packages/cli/templates/trading-recommendation-agent/README.md`
- `packages/eslint-config/README.md`
- `packages/examples/README.md`
- `packages/examples/src/README.md`
- `packages/identity/README.md`
- `packages/payments/README.md`
- `packages/prettier-config/README.md`
- `packages/scheduler/README.md`
- `packages/types/README.md`

### Architecture & Guide Docs (3)
- `docs/ARCHITECTURE.md`
- `docs/PAYMENTS.md`
- `docs/WALLETS.md`

### AGENTS.md Files (8)
- `AGENTS.md` (root)
- `packages/core/AGENTS.md`
- 6 CLI template AGENTS.md files

### Docs Site Pages (20+)
- `lucid-docs/content/docs/getting-started/` (4 pages)
- `lucid-docs/content/docs/packages/` (13 pages)
- `lucid-docs/content/docs/concepts/` (2 pages)
- `lucid-docs/content/docs/examples/` (8 pages)
- `lucid-docs/content/docs/migration-guides/` (2 pages)

### Source Code Verified Against
- `packages/core/src/index.ts`
- `packages/core/src/runtime.ts`
- `packages/core/src/extensions/builder.ts`
- `packages/core/package.json`
- `packages/hono/src/index.ts`
- `packages/hono/src/app.ts`
- `packages/payments/src/index.ts`
- `packages/payments/src/policy.ts`
- `packages/payments/src/policy-schema.ts`
- `packages/wallet/src/index.ts`
- `packages/analytics/src/index.ts`
- `packages/analytics/src/api.ts`
