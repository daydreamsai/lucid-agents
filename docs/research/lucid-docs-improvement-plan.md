# Lucid documentation improvement plan

**Prepared:** 20 July 2026
**Scope:** The public Lucid documentation site in `lucid-docs`, its marketing homepage, examples, package reference, migration guides, and documentation quality controls.
**Strategic input:** [x402 strategic positioning](./x402-strategic-positioning.md)

## Executive recommendation

Rebuild the documentation around the commercial outcome Lucid enables:

> **Turn any TypeScript function into a paid API that agents and applications can discover and call.**

The current documentation has a strong base of detailed package pages and valid MDX structure, but its primary journey is still a free echo agent. The site introduces packages and protocols before it helps a developer complete a paid transaction. It also mixes the open-source SDK, unreleased repository features, hosted Lucid products, and a third-party facilitator into one apparent product surface.

The documentation program should therefore proceed in this order:

1. Establish one release truth and correct the pages that can currently mislead a developer.
2. Make a verified x402 seller flow the primary quickstart.
3. Organize task guides around selling, buying, building, and operating services.
4. Separate open-source SDK documentation from hosted-product documentation.
5. Refresh reference and examples against tested source code.
6. Add automated controls so examples cannot silently drift from the SDK.

This is not principally a copywriting project. It is a product-contract and developer-experience project. Documentation should describe the current, installable SDK precisely; product work such as MCP integration, Bazaar publishing, `upto`, batch settlement, signed receipts, or full AP2 mandates must remain explicitly blocked until those capabilities ship.

## 1. Goals and non-goals

### Goals

- Help a TypeScript developer receive a real testnet x402 payment in ten minutes or less.
- Give sellers, buyers, and operators distinct paths with clear prerequisites and next steps.
- Position Lucid as the application runtime for machine commerce, with x402 as the primary payment rail rather than the entire category.
- Make the boundary between the open-source SDK, hosted Lucid products, external providers, and future capabilities unmistakable.
- Align every command, import, configuration key, API example, and compatibility claim with an installable release.
- Reduce duplicate handwritten code by deriving examples from tested fixtures where practical.
- Add status, version, and verification metadata that lets readers judge whether a page applies to them.
- Preserve the useful depth in the existing package reference while moving it behind outcome-led guides.

### Non-goals

- Redesigning the entire visual identity of the documentation site.
- Implementing missing SDK capabilities solely so that they can be documented.
- Publishing future x402 features as current support.
- Turning every package README into a duplicate documentation page.
- Combining hosted platform operations and open-source SDK usage into a single quickstart.
- Rewriting generated API documentation by hand.

## 2. Current-state audit

### Inventory and health

| Measure                                                 | Current state |
| ------------------------------------------------------- | ------------: |
| MDX pages                                               |            45 |
| Approximate MDX words                                   |        31,472 |
| Fenced code blocks                                      |           362 |
| Broken internal links found                             |             0 |
| Documentation typecheck                                 |          Pass |
| Production documentation build                          |          Pass |
| TypeScript examples compiled by the documentation build |            No |
| Clean-room quickstarts run in CI                        |            No |

The existing Fumadocs/TanStack site, local search, `llms.txt` surfaces, and package-level reference provide a sound technical foundation. The build and internal link health are good. The main risk is semantic correctness: MDX can build successfully while a command refers to a nonexistent package or a TypeScript example uses an obsolete API.

### What is already working

- Package pages cover most of the monorepo and contain meaningful implementation detail.
- Payments, HTTP, and A2A documentation reflect much of the current extension-based architecture.
- Examples cover policies, scheduled calls, identity, wallets, MPP, and Stripe destination mode.
- Migration guides preserve historical context.
- The documentation application already runs typechecking and a production build in CI.
- Internal documentation links resolve.

### Core experience problems

1. **The first success is not commercial.** The primary quickstart creates a free echo agent and never shows a `402`, completes a paid call, or verifies a settlement.
2. **The site leads with implementation inventory.** Readers must understand agents, entrypoints, packages, adapters, and payment protocols before seeing the end-to-end outcome.
3. **The public homepage contains stale SDK code.** It uses synchronous construction, an obsolete payments shape, an obsolete entrypoint API, `name` instead of `key`, and an object price rather than the current USD decimal string.
4. **Release truth is ambiguous.** Repository manifests and docs describe a newer surface than the versions currently published to npm, while some documented packages are not publicly available.
5. **Product surfaces are mixed.** Open-source packages, hosted development endpoints, the x402 router, agent-generation workflows, and an external facilitator are presented as though they share one support and release lifecycle.
6. **Protocol claims sometimes exceed implementation.** Current Lucid x402 support is narrower than the current protocol ecosystem, and the AP2 package is role metadata rather than a full mandate/payment implementation.
7. **Operational guidance is fragmented.** Durable storage, facilitator selection, security, idempotency, observability, and production readiness do not form one coherent path.
8. **Examples are not executable documentation.** Code is duplicated across MDX, package READMEs, templates, and tests without one source of truth.

## 3. Stop-ship accuracy register

These items should be resolved before directing new traffic to the documentation.

| Priority | Finding                                                                                                     | Why it matters                                          | Required action                                                                 | Dependency/owner decision |
| -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------- |
| P0       | Marketing homepage uses obsolete construction, payments, entrypoint, and price APIs                         | The first code sample cannot be trusted                 | Replace it with a compiled example sourced from the paid quickstart             | SDK/DX                    |
| P0       | Installation names `@lucid-agents/next`, although Next.js is a generated adapter rather than a package      | Clean installs fail                                     | Remove the package and document the CLI adapter correctly                       | SDK/DX                    |
| P0       | Installation asks users to add legacy `x402` and `x402-fetch` peer dependencies                             | Creates unnecessary/conflicting setup                   | Document only direct Lucid dependencies and current prerequisites               | Payments                  |
| P0       | Installation uses stale environment variables and ambiguous integer pricing                                 | Developers can misprice or fail configuration           | Use current `PAYMENTS_*` names and explicitly document USD decimal pricing      | Payments                  |
| P0       | Repository documentation and npm releases do not describe the same surface                                  | Readers cannot know what is installable                 | Define `Stable` and `Next` channels; tie Stable to published npm artifacts      | Release owner             |
| P0       | `packages/facilitator.mdx` describes `@daydreamsai/facilitator`, not a Lucid workspace package              | Misstates package ownership/support                     | Move to provider/infrastructure documentation or remove from Lucid reference    | Product/partnerships      |
| P0       | `migration-guides/v4-runtime.mdx` conflicts with current repository versioning and contains suspect imports | Migration target is unclear and code may fail           | Hold publication until release naming and imports are verified                  | Release owner             |
| P0       | Stable docs use `lucid-dev.daydreams.systems` and `api-lucid-dev.daydreams.systems`                         | Development infrastructure appears production-supported | Move to a Hosted Products area and replace or clearly label URLs                | Hosted platform owner     |
| P1       | Quickstart never exercises x402                                                                             | Fails the core adoption promise                         | Replace it with a seller plus buyer testnet loop                                | DX                        |
| P1       | TanStack is described as a dashboard rather than the current service storefront                             | Misrepresents the generated product                     | Standardize on “service storefront”                                             | CLI/TanStack              |
| P1       | AP2 documentation implies a broader implementation than role metadata                                       | Creates false protocol expectations                     | Rename and scope the page to AP2 role metadata                                  | AP2 owner                 |
| P1       | MPP and catalog are documented without an installable stable release                                        | Stable readers hit missing packages                     | Mark as `Next` until publication and clean-room verification                    | Release owner             |
| P1       | Current x402 constraints are not summarized in one support matrix                                           | Readers infer support from the wider x402 ecosystem     | Document exact-only, network, asset, accepts, facilitator, and extension limits | Payments                  |
| P1       | No package pages exist for analytics or scheduler                                                           | Public surface is incomplete                            | Add concise package references after release status is confirmed                | Package owners            |

## 4. Audience and jobs to be done

### Primary audience

TypeScript developers who want to expose or consume machine-callable digital services with programmable payment, policy, and operational controls.

### Audience segments

| Segment                 | Job                                                                                 | First proof they need                                      | Next concern                                       |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Service seller          | Monetize a function or existing API                                                 | A buyer receives `402`, pays, and gets a typed result      | Pricing, settlement, deployment, failures          |
| Service buyer           | Call paid endpoints safely from an application or agent                             | A budgeted testnet call succeeds                           | Policies, wallets, retries, receipts, discovery    |
| Application developer   | Add machine commerce to an existing Hono, Express, Next.js, or TanStack application | One route is paid without rebuilding the app               | Framework integration and migration                |
| Agent developer         | Publish discoverable capabilities and call other agents                             | Agent Card/A2A discovery plus a paid invocation works      | Identity, tasks, scheduling, trust                 |
| Production operator     | Run paid services reliably                                                          | Payments, fulfillment, and storage survive restart/failure | Observability, reconciliation, security, providers |
| Tool-assisted developer | Use a coding agent to scaffold and modify a service                                 | Generated code builds and follows the current API          | Review, deployment, maintenance                    |

### Recommended journey hierarchy

1. **Sell a paid API** — the default and most prominent path.
2. **Build a budgeted buyer** — the complementary side of the economic loop.
3. **Add Lucid to an existing application** — adoption without framework replacement.
4. **Run a long-running paid task** — demonstrate fulfillment beyond a synchronous response.
5. **Publish and discover services** — A2A/catalog today; Bazaar only when implemented.
6. **Operate in production** — move from demo to reliable service.
7. **Use a coding agent** — an accelerator, not the definition of the SDK.

## 5. Positioning and terminology contract

Every high-traffic page should reinforce the same category and vocabulary.

### Message hierarchy

- **Category:** TypeScript application runtime for machine commerce.
- **Primary promise:** Turn any TypeScript function into a paid API that agents and applications can discover and call.
- **Primary rail:** x402.
- **Protocol breadth:** x402 and MPP, with other agent, identity, and payment metadata composed as extensions.
- **Differentiation:** typed capabilities, framework portability, authorization, fulfillment, policies, tasks, discovery, storefront, durable state, and analytics in one runtime.
- **Avoid:** “another x402 SDK,” “crypto payments framework,” or package-count-led messaging.

### Terms

| Use                              | Meaning                                                           | Avoid or qualify                                   |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Service, offering, or capability | The user-facing commercial unit                                   | Do not require readers to learn “entrypoint” first |
| Entrypoint                       | The SDK object that defines a callable capability                 | Use after explaining the user outcome              |
| Payment rail                     | x402 or MPP negotiation and settlement path                       | Do not call Lucid itself a payment protocol        |
| Service storefront               | Generated UI for viewing/invoking offerings                       | “Dashboard” unless an operations dashboard exists  |
| Agent Card / A2A discovery       | A2A capability advertisement                                      | Do not conflate with x402 Bazaar                   |
| AP2 role metadata                | The current AP2 package function                                  | Do not claim mandate or authorization handling     |
| Stable                           | Publicly installable and clean-room verified npm surface          | Do not equate with the default branch              |
| Next                             | Repository or prerelease surface not yet guaranteed in public npm | Must carry a visible status banner                 |
| Hosted Lucid Platform            | Lucid-operated APIs/services with their own lifecycle             | Keep separate from OSS SDK requirements            |
| Provider                         | External facilitator, wallet, network, or infrastructure product  | Do not present as a Lucid package                  |

## 6. Target information architecture

The navigation should begin with outcomes, progressively reveal concepts, and leave exhaustive package detail to reference.

```text
Docs
├── Start
│   ├── Choose your path
│   ├── Install Lucid
│   ├── Sell a paid API
│   ├── Build a budgeted buyer
│   ├── Add Lucid to an existing app
│   └── Build with a coding agent
├── Build
│   ├── Define a capability
│   ├── Choose a payment model
│   ├── Receive x402 payments
│   ├── Stream and meter work
│   ├── Run asynchronous tasks
│   ├── Create a service storefront
│   └── Publish a catalog
├── Buy
│   ├── Configure a wallet
│   ├── Call a paid service
│   ├── Set policies and budgets
│   ├── Handle retries and idempotency
│   ├── Discover services
│   └── Schedule calls
├── Operate
│   ├── Production checklist
│   ├── Configure a facilitator
│   ├── Use durable storage
│   ├── Secure keys and requests
│   ├── Observe payments and fulfillment
│   ├── Troubleshoot payments
│   └── Deploy
│       ├── Hono
│       ├── Express
│       ├── Next.js
│       └── TanStack Start
├── Protocols
│   ├── x402
│   ├── MPP
│   ├── SIWX
│   ├── A2A
│   ├── ERC-8004
│   └── AP2 role metadata
├── Examples
├── Reference
│   ├── Packages
│   ├── Configuration
│   ├── Environment variables
│   └── Errors
└── Migrations

Products (separate navigation group or separate site)
├── x402 Router
├── Hosted Lucid Platform and API SDK
└── Agent creation / xgate integrations
```

### Navigation rules

- Keep existing URLs initially where changing them would add migration risk; use navigation labels and redirects to transition.
- Do not place `Products` inside the OSS getting-started sequence.
- Put a Stable/Next selector or highly visible status banner on every version-sensitive page.
- Let readers reach reference from task guides, but do not require reference reading to complete a task.
- Use a persistent “What are you building?” choice on the docs landing page: seller, buyer, existing app, or production deployment.

## 7. Current page disposition

### Marketing and documentation landing pages

| Current page                      | Disposition | Priority | Scope                                                                                                                                                                                        |
| --------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lucid-docs/src/routes/index.tsx` | Rewrite     | P0       | Replace stale code, package/chain counts, and generic framework claims with the machine-commerce promise, paid call proof, outcome paths, current framework support, and a verified snippet. |
| `content/docs/index.mdx`          | Rewrite     | P0       | Make this a path chooser with seller as the primary CTA, buyer and existing-app alternatives, a short architecture explanation, current support status, and production next steps.           |

### Getting started

| Current page                                      | Disposition    | Priority | Scope                                                                                                                                                                                                       |
| ------------------------------------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getting-started/introduction.mdx`                | Rewrite        | P0       | Explain the application layer above x402/MPP, define capability versus entrypoint, show the seller/buyer loop, and explicitly state what Lucid does not replace.                                            |
| `getting-started/installation.mdx`                | Rewrite        | P0       | Correct package names, CLI commands, prerequisites, environment variables, payment units, and Stable/Next installation instructions. Clean-room test every path.                                            |
| `getting-started/quickstart.mdx`                  | Replace        | P0       | Create the seller golden path: scaffold, set a testnet receiving address, define a priced capability, start it, observe `402`, make a paid buyer call, inspect success, and show the next production steps. |
| `getting-started/creating-agents-with-agents.mdx` | Move and split | P1       | Keep generic coding-agent workflow under Start. Move xgate, server wallet, hosted endpoint, and hosted deployment details to Products after ownership and URLs are validated.                               |

### Concepts

| Current page               | Disposition         | Priority | Scope                                                                                                                                                               |
| -------------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `concepts/agents.mdx`      | Reframe             | P1       | Rename conceptually to runtime and extensions. Explain lifecycle, composition, and framework portability after the reader understands the commercial service model. |
| `concepts/entrypoints.mdx` | Promote and rewrite | P1       | Become Build → Define a capability. Lead with input/output contract and fulfillment, then document the `EntrypointDef` API, pricing, tasks, streaming, and errors.  |

### Hosted router and developer tooling

| Current page/group                                                                                                                | Disposition       | Priority | Scope                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-router/index.mdx`, `ai-router/opencode.mdx`, `ai-router/openclaw.mdx`, `ai-router/ironclaw.mdx`, and `ai-router/nanoclaw.mdx` | Move              | P1       | Create a Products → x402 Router group or separate product site. Validate service status, auth, pricing, production URL, support owner, and relationship to the OSS SDK before republishing. |
| `autonomous-agents/index.mdx`                                                                                                     | Consolidate       | P2       | Merge framework-agnostic guidance into Build with a coding agent; remove generic AI copy and link to verified workflows.                                                                    |
| `autonomous-agents/building-applications.mdx`                                                                                     | Consolidate/split | P2       | Retain useful application patterns; move hosted-specific setup to Products.                                                                                                                 |
| `skills/index.mdx`                                                                                                                | Consolidate       | P2       | Make this one concise tool-assisted development page with current agent instructions and links to maintained skills/templates.                                                              |

### Examples

| Current page                           | Disposition      | Priority | Scope                                                                                                                                                            |
| -------------------------------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples/index.mdx`                   | Rewrite          | P1       | Organize examples by economic loop and maturity: first payment, buyer controls, long-running fulfillment, discovery, identity, and provider-specific deployment. |
| `examples/core.mdx`                    | Replace/trim     | P1       | Point to tested minimal source; avoid duplicating the free quickstart.                                                                                           |
| `examples/a2a.mdx`                     | Reframe          | P2       | Present as discoverable and long-running paid work; distinguish A2A discovery from x402 Bazaar.                                                                  |
| `examples/calling-paid-endpoints.mdx`  | Split            | P1       | Create an OSS buyer guide for direct x402 calls and a separate hosted Runtime API example. Remove development URLs from Stable docs.                             |
| `examples/stripe-destination-mode.mdx` | Keep and verify  | P2       | Label as provider-specific, document ownership and prerequisites, and clean-room test it.                                                                        |
| `examples/mpp-paid-service.mdx`        | Keep with status | P2       | Mark Next until the package is published; verify the current MPP API and clearly compare when to choose MPP versus x402.                                         |
| `examples/payment-policies.mdx`        | Promote          | P1       | Become Buy → Set policies and budgets; keep a linked executable example.                                                                                         |
| `examples/scheduler.mdx`               | Split            | P2       | Create a concise buyer scheduling guide and a scheduler package reference; move the full source to a tested fixture.                                             |
| `examples/identity.mdx`                | Keep and verify  | P2       | Place under Protocols/Identity or examples; make EVM-only identity versus payment-network independence explicit.                                                 |
| `examples/wallet.mdx`                  | Promote          | P1       | Become Buy → Configure a wallet; separate buyer signing from seller receiving configuration.                                                                     |

### Package reference

| Current page/group         | Disposition                   | Priority | Scope                                                                                                                                              |
| -------------------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/index.mdx`       | Refresh                       | P1       | Describe the extension graph and status of each public package; remove package-count marketing and show Stable/Next availability.                  |
| `packages/api-sdk.mdx`     | Move                          | P1       | Place under Hosted Lucid Platform. Explain that it targets a hosted Runtime API, not the local agent runtime.                                      |
| `packages/types.mdx`       | Keep and verify               | P2       | Document canonical contracts and subpaths; avoid re-export guidance.                                                                               |
| `packages/core.mdx`        | Keep and verify               | P1       | Align construction, extension lifecycle, entrypoint registry, and async build examples with current APIs.                                          |
| `packages/http.mdx`        | Keep and verify               | P1       | Explain the canonical route plan, authorization transaction, invoke/stream/task behavior, and adapter delegation.                                  |
| `packages/payments.mdx`    | Audit and add matrix          | P0       | Add exact current network, scheme, asset, accepts, SIWX, provider, storage, and settlement support. Explicitly identify unsupported x402 features. |
| `packages/mpp.mdx`         | Keep with Next status         | P1       | Verify current `mppx` integration and mark unavailable in Stable until public release.                                                             |
| `packages/catalog.mdx`     | Keep with Next status         | P2       | Clarify YAML/CSV entrypoint generation and distinguish catalogs from external discovery marketplaces.                                              |
| `packages/facilitator.mdx` | Remove from package reference | P0       | Recast as an external provider guide only if there is a current support agreement and verified package.                                            |
| `packages/identity.mdx`    | Keep and verify               | P2       | Clarify ERC-8004 EVM scope, registration side effects, trust metadata, and independence from the payment network.                                  |
| `packages/a2a.mdx`         | Keep and verify               | P1       | Document cards, calls, owned task state, durability, and payment authorization without implying Bazaar support.                                    |
| `packages/wallet.mdx`      | Keep and verify               | P1       | Separate agent/developer wallets, buyer/seller roles, supported connectors, and key-handling guidance.                                             |
| `packages/ap2.mdx`         | Rename and narrow             | P1       | Call it AP2 role metadata; document the exact Agent Card descriptor and explicitly exclude mandates/payment authorization.                         |
| `packages/hono.mdx`        | Keep and move in nav          | P2       | Place under Operate → Deploy and link to reference.                                                                                                |
| `packages/tanstack.mdx`    | Keep and update               | P1       | Use service storefront terminology and document UI versus headless variants.                                                                       |
| `packages/express.mdx`     | Keep and move in nav          | P2       | Place under Operate → Deploy and document the Web Request bridge.                                                                                  |
| `packages/cli.mdx`         | Rewrite and verify            | P0       | Generate option/preset tables from the CLI where possible; verify adapter names, templates, noninteractive flags, and generated commands.          |
| Analytics package page     | Add                           | P2       | Document bound payment analytics, required tracker, available operations, state/storage expectations, and status.                                  |
| Scheduler package page     | Add                           | P2       | Document leased/idempotent scheduled A2A calls, stores, failure behavior, and status.                                                              |

### Migrations

| Current page                      | Disposition         | Priority | Scope                                                                                                                                             |
| --------------------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migration-guides/index.mdx`      | Refresh             | P1       | Index migrations by source/target release and display support status.                                                                             |
| `migration-guides/v4-runtime.mdx` | Block and reconcile | P0       | Confirm the actual release number, package subpaths, factory names, and public availability before publishing or rename it to the correct target. |
| `migration-guides/x402-v2.mdx`    | Keep as historical  | P2       | Add “applies to” metadata, link to the current x402 support matrix, and ensure it is not presented as the recommended starting point.             |

## 8. New page briefs

### Start → Sell a paid API

**User outcome:** A new developer completes a testnet payment against a local Lucid service.

**Required flow:**

1. State runtime, Bun/Node, wallet, network, and testnet-funds prerequisites.
2. Scaffold one supported Stable template.
3. Configure the receiving address and facilitator using current environment keys.
4. Define a typed capability with a plainly explained USD decimal price.
5. Start the server and make an unpaid request that visibly returns `402` requirements.
6. Run a supplied buyer command or companion script that signs and pays.
7. Show the successful typed response and where payment/fulfillment state can be inspected.
8. Link to production storage, security, deployment, and troubleshooting.

**Acceptance:** The flow runs from a clean directory using only published packages, contains no undisclosed credentials, and is exercised in CI.

### Start → Build a budgeted buyer

**User outcome:** An application calls a paid service within explicit network and spend policy.

**Required content:** wallet setup, payment negotiation, policy checks, explicit authorization, paid retry, idempotency, response verification, and failure handling. The example must distinguish automatic payment convenience from safe autonomous spending.

### Start → Add Lucid to an existing app

**User outcome:** A developer adds one paid capability without adopting a new server framework.

**Required content:** a short framework decision table, Hono and Express first, generated Next.js adapter and TanStack alternatives, shared runtime construction, adapter delegation, and migration cautions.

### Build → Choose a payment model

**User outcome:** A developer chooses a supported charging model based on workload shape.

**Required content:** fixed per-call x402 `exact` and current MPP modes only. Show future `upto`, batch, and sessions in a clearly labeled roadmap comparison only if that comparison is useful and maintained. Never imply support based solely on upstream protocol availability.

### Operate → Production checklist

**User outcome:** A team can identify everything that changes between a local demo and a reliable paid service.

**Checklist areas:** release channel, network/assets, facilitator, secrets, durable payment/task storage, atomic reservations, fulfillment failure, idempotency, replay protection, settlement/reconciliation, logging, analytics, rate limits, deployment runtime, health checks, and incident response.

### Protocols → x402 support matrix

**User outcome:** A developer knows exactly what Lucid supports without inferring from upstream x402 documentation.

**Matrix dimensions:** Lucid version, x402 version, schemes, networks, assets, payment options per response, facilitators, SIWX, Bazaar, payment identifiers, signed offers/receipts, gas sponsorship, settlement modes, server adapters, and buyer clients. Each row should be `Supported`, `Partial`, `Planned`, or `Not supported`, with a link to the implementation or issue.

### Operate → Troubleshoot payments

**User outcome:** A developer can localize a failure to configuration, negotiation, verification, settlement, or fulfillment.

**Required content:** status/header symptoms, safe diagnostic output, common address/network/asset mistakes, facilitator errors, clock/signature problems, retries, double-charge prevention, and what information to include in a support report. A future `payments doctor` command can replace manual checks only after it ships.

## 9. Content design standards

### Every task guide should contain

1. The result the reader will achieve.
2. Stable/Next status and last verified version/date.
3. Prerequisites, including costs, credentials, networks, and side effects.
4. One recommended path before alternatives.
5. A minimal runnable example sourced from tested code.
6. Expected output, including relevant HTTP/payment state.
7. Failure modes and recovery.
8. Production implications.
9. A next step based on the reader's job.

### Every reference page should contain

- Package name, current public version/status, runtime compatibility, and import paths.
- What the package owns and explicitly does not own.
- Configuration and API signatures generated or checked against source.
- Lifecycle and side effects.
- Error behavior.
- A minimal example plus links to task guides.
- A last-verified marker tied to a commit or release.

### Code example policy

- Prefer importing snippets from files that tests compile and execute.
- If MDX must contain inline code, extract it during CI and compile it against the documented release.
- Show full required imports; avoid unexplained `...` in the primary path.
- Use placeholder names that encode format, such as `0xYOUR_EVM_ADDRESS`, and state when values are secrets.
- Show payment amounts in one canonical unit and label it next to every first-use example.
- Never use development service URLs in Stable docs.
- Avoid examples that trigger registration, settlement, or deployment without an explicit side-effect warning.
- Link large examples to source rather than maintaining hundreds of lines in MDX.

### Status metadata

Adopt frontmatter or a shared component with:

```yaml
status: stable # stable | next | experimental | deprecated | hosted
verifiedVersion: 3.0.0
verifiedAt: 2026-07-20
product: sdk # sdk | router | hosted-platform | provider
```

The site should render this visibly on version-sensitive pages. `verifiedVersion` must correspond to an installable artifact for Stable pages.

## 10. Documentation validation and CI

The existing documentation typecheck and production build should remain, but they are not sufficient.

### Required checks

| Check                          | Purpose                                                                                 | Initial scope                            |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| MDX build/typecheck            | Catch syntax, imports, and application regressions                                      | All pages; existing                      |
| Internal link checker          | Catch moved/deleted routes and anchors                                                  | All pages                                |
| External link checker          | Detect dead provider/protocol links                                                     | Scheduled, with allowlist/retries        |
| TypeScript snippet compilation | Catch obsolete imports, APIs, and configuration shapes                                  | P0/P1 pages first, then all TS blocks    |
| Clean-room scaffold test       | Validate CLI command, generated dependencies, build, and boot                           | Each documented Stable template/adapter  |
| Golden-path integration test   | Validate unpaid `402` and authorized paid response without external production services | Seller and buyer quickstarts             |
| Published-package test         | Ensure docs work against npm, not workspace symlinks                                    | Stable channel on release and nightly    |
| Environment-key lint           | Prevent legacy keys and secret-like literal values                                      | All MDX and templates                    |
| Terminology/stale-import lint  | Prevent known obsolete package names and overclaims                                     | All content                              |
| Route redirect test            | Protect moved docs and search links                                                     | Every information-architecture migration |
| Freshness report               | Surface pages not verified within a release window                                      | Scheduled, owner-routed                  |

### Suggested implementation sequence

1. Add a small repository script that scans MDX for prohibited imports, package names, development URLs, and legacy environment keys.
2. Move primary quickstart code into a test fixture and embed or synchronize the snippet from that fixture.
3. Add a clean temporary-directory CLI scaffold test using packed/published packages.
4. Extend the existing examples smoke suite to assert `402`, authorization, response, and failure release behavior.
5. Add external link and freshness jobs after the high-risk content is corrected; otherwise they create noise without protecting the core path.

## 11. Delivery plan

### Phase 0 — Establish the product truth

**Estimate:** 1–2 focused days.
**Exit condition:** Writers know which surface is Stable, Next, hosted, provider-owned, or future.

- Decide the public release/version channel and whether Stable docs follow npm while Next follows `master`.
- Confirm the public status and publication plan for MPP, catalog, analytics, and scheduler.
- Confirm ownership and production status of the x402 router, hosted Runtime API, xgate agent creator, and facilitator content.
- Confirm the default supported facilitator/provider story.
- Approve the positioning and terminology contract in this plan.
- Temporarily remove or banner pages that cannot be made accurate immediately.

### Phase 1 — Correct the promise and golden path

**Estimate:** 5–8 focused days.
**Exit condition:** A new developer can trust the homepage, install Lucid, and complete the primary paid flow.

- Rewrite the marketing homepage and documentation landing page.
- Rewrite introduction and installation.
- Replace the free quickstart with the paid seller golden path.
- Add the complementary budgeted buyer guide.
- Correct all P0 package, command, environment, price, and URL issues.
- Add Stable/Next/Hosted/Provider banners to affected pages.
- Add compiled/tested fixtures for the two quickstarts.

### Phase 2 — Build the outcome-led journeys

**Estimate:** 7–10 focused days.
**Exit condition:** Sell, buy, build, and operate journeys are complete enough to take a reader from first payment to deployment.

- Implement the target navigation and redirects.
- Rewrite entrypoints as Define a capability.
- Add payment-model, receive-x402, wallet, paid-call, policies, retries/idempotency, tasks, storage, security, deployment, and production-checklist guides.
- Reframe TanStack around the service storefront.
- Add the current x402 support matrix.
- Cross-link every task guide to reference and the next operational step.

### Phase 3 — Make reference and examples trustworthy

**Estimate:** 8–12 focused days.
**Exit condition:** Package pages describe the release exactly and examples are backed by tests.

- Audit all package reference pages against source and published package exports.
- Add analytics and scheduler package pages.
- Narrow AP2 claims and mark release status for MPP/catalog.
- Remove the external facilitator from Lucid package reference.
- Split OSS versus hosted examples.
- Replace large copied code blocks with verified fixtures.
- Reconcile or hold the v4 migration guide.

### Phase 4 — Separate products and prepare expansion

**Estimate:** 5–8 focused days, excluding product implementation.
**Exit condition:** Hosted products have their own accurate acquisition and operation paths.

- Create a distinct Products group or separate product documentation site.
- Move router, hosted API SDK, agent creator, and provider-specific content.
- Add product-specific availability, pricing, authentication, limits, status, and support ownership.
- Prepare—not publish as current—documentation briefs for MCP tools, Bazaar, `upto`, batch settlement, signed receipts, or AP2 mandates.

### Phase 5 — Install continuous quality controls

**Estimate:** 3–5 focused days.
**Exit condition:** The most damaging forms of documentation drift fail CI or produce an owned alert.

- Compile snippets.
- Run clean-room scaffold and golden-path tests.
- Check internal/external links and redirects.
- Add stale term/import/environment URL checks.
- Publish a page freshness report and assign owners.
- Instrument docs funnels and search failure reporting.

### Total scope

The documentation-only and validation work is approximately **28–43 focused engineer/writer days**, excluding missing SDK features and hosted-product decisions. Phases 2–4 can partially overlap after Phase 0. The critical path is release truth → verified golden path → information architecture → reference cleanup.

## 12. Workstreams and ownership

| Workstream                             | Accountable role          | Key collaborators           |
| -------------------------------------- | ------------------------- | --------------------------- |
| Positioning and docs home              | Product/DX                | Design, SDK lead            |
| Stable/Next release truth              | Release owner             | Package owners, DX          |
| Seller/buyer golden paths              | Payments owner            | CLI, wallet, examples, DX   |
| Build/buy/operate guides               | DX lead                   | Domain package owners       |
| Hosted product separation              | Hosted product owner      | DX, infrastructure, support |
| Package reference                      | Individual package owners | DX editor                   |
| Executable examples/CI                 | SDK/DX engineer           | Release engineering         |
| Information architecture and redirects | Docs engineer             | Product/DX                  |
| Funnel/search metrics                  | Product/DX                | Web/analytics               |

No package reference should be approved solely by the docs owner; the owning package maintainer should verify behavior and exclusions.

## 13. Success metrics

### Activation

- Median time from landing on the seller quickstart to the first successful testnet paid response: **≤10 minutes**.
- At least **70%** of developers who start the installation step reach the local `402` observation.
- At least **50%** of those who observe `402` complete the paid response in the same session.
- Quickstart failure feedback identifies the stage: install, configure, boot, negotiate, authorize, settle, or fulfill.

### Trust and quality

- 100% of Stable install commands pass clean-room CI.
- 100% of P0/P1 TypeScript snippets compile against the documented release.
- 0 Stable pages reference nonexistent packages, legacy x402 dependencies, or development service URLs.
- 100% of version-sensitive pages display status and last-verified metadata.
- No package support claim lacks an owner and release state.
- Internal links and documented route redirects remain green.

### Discoverability and comprehension

- “How do I get paid?”, “How do I call a paid API?”, “Which x402 features are supported?”, and “How do I deploy?” each resolve to one canonical page.
- Search exits and repeated searches decline for payments configuration, pricing units, facilitator setup, and wallet setup.
- Package reference remains reachable within two clicks but is not the dominant first-session path.

## 14. Risks and open decisions

| Decision/risk                                          | Why it blocks or changes the plan                                                 | Recommended resolution                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| What release is Stable?                                | Determines every install command and API example                                  | Treat public npm as Stable; publish master features under Next until released     |
| Is the next release v3 or v4?                          | The migration guide and badges currently conflict                                 | Choose one release sequence and rename/remove the guide before navigation changes |
| Which packages are public?                             | MPP/catalog and missing analytics/scheduler references cannot be stable otherwise | Publish and verify, or mark Next consistently                                     |
| Who owns hosted products?                              | Router/API/xgate pages need current URLs, auth, status, and support               | Require a named product owner and SLA before making them primary navigation       |
| Is `@daydreamsai/facilitator` a supported integration? | Current package page implies Lucid ownership                                      | Move to providers and document the relationship explicitly, or remove it          |
| What is the canonical testnet path?                    | Quickstart reliability depends on network, asset, wallet, and facilitator         | Select one maintained zero-surprise path and test it on a schedule                |
| Should old URLs be preserved?                          | Search results and external links may already target them                         | Preserve with redirects for at least one release cycle                            |
| Can snippets be imported into MDX?                     | Determines maintenance approach                                                   | Prefer tested fixture imports; otherwise build extraction/compilation tooling     |
| What telemetry is acceptable?                          | Funnel metrics require privacy/product policy                                     | Track documentation steps and errors without wallet addresses or payment payloads |

## 15. Recommended first pull request

Keep the first change narrow enough to review as one coherent developer journey:

1. Add the Stable/Next content status component and release policy.
2. Replace the homepage hero and stale SDK code.
3. Rewrite the docs landing page as a seller/buyer/existing-app path chooser.
4. Correct installation commands, packages, environment variables, and price units.
5. Replace the free quickstart with the paid seller golden path.
6. Add one tested buyer script or command to complete the loop.
7. Move or banner hosted development endpoints and external facilitator content.
8. Add CI that compiles and runs this exact quickstart from a clean directory.

### First-PR acceptance criteria

- A developer following only Stable docs can install all named packages from the public registry.
- The homepage code is the same API shape as the tested quickstart.
- The quickstart observes an unpaid `402` and completes one authorized testnet response.
- The price unit, network, asset, facilitator, receiving address, and side effects are explicit.
- No primary onboarding page mentions `@lucid-agents/next`, legacy `x402`/`x402-fetch` installation, or a development service URL.
- The documentation typecheck, production build, internal link check, snippet compile, and golden-path test pass.
- Moved pages retain redirects or a clear replacement link.

## 16. Definition of done for the full program

The documentation improvement program is complete when:

- The public promise, quickstarts, current SDK release, and package reference all describe the same installable product.
- A seller and a buyer can complete their first paid loop without reading package architecture first.
- Existing-application and production-operation journeys are complete and linked from onboarding.
- OSS SDK, hosted products, external providers, and future capabilities are visually and structurally distinct.
- Every current page has been kept, rewritten, moved, merged, deprecated, or removed according to an explicit disposition.
- High-risk code paths are executed in CI rather than validated only as MDX.
- The docs team can measure where activation fails and route stale pages to accountable owners.
