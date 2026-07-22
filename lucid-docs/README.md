# Lucid documentation site

The public Lucid documentation is a Fumadocs site served by TanStack Start and
Cloudflare. Its contract is stricter than “the MDX builds”: every page declares
its release channel and product owner, navigation is checked against the file
tree, high-risk examples come from tested source, and moved routes retain
redirects.

Public site: [docs.daydreams.systems](https://docs.daydreams.systems/)

## Run the site

From this directory:

```bash
bun install
bun run dev
```

The development server listens on `http://localhost:3000` by default.

Run the complete local verification pipeline before opening a pull request:

```bash
bun run verify
```

From the repository root, the equivalent documentation contract suite is:

```bash
bun run test:docs
bun run --cwd lucid-docs types:check
bun run --cwd lucid-docs build
```

The Stable clean-room test installs public npm packages rather than workspace
links. It uses the network, so run it when changing the public quickstart or
release table:

```bash
bun run test:docs-stable
```

## Information architecture

Documentation lives in `content/docs/` and is organized by reader job:

```text
content/docs/
├── start/               first paid loop and adoption choices
├── build/               define and expose seller capabilities
├── buy/                 wallets, policy, paid calls, and schedules
├── integrate/           agent-framework composition and MCP boundary
├── operate/             production, durability, security, and deployment
├── protocols/           exact Lucid coverage versus upstream standards
├── examples/            repository-backed examples
├── packages/            package API and ownership reference
├── reference/           release, configuration, environment, and errors
├── products/            separately operated hosted products
└── migration-guides/    historical, version-scoped migrations
```

Each directory has a `meta.json`. Add every page exactly once. The drift check
fails on an orphaned page, unknown navigation entry, duplicate entry, missing
package reference, stale relocation, or missing repository source link.

Every new page must be reachable from the root documentation page within two
clicks. Task guides should link to the relevant package reference and the next
production step.

The point-in-time market and all-page audit lives at
[`docs/research/market-and-docs-benchmark.md`](../docs/research/market-and-docs-benchmark.md).
Use it to distinguish remediated accuracy defects from remaining product and
conformance work.

## Product and release truth

Lucid is the TypeScript application runtime around machine-commerce protocols.
It does not replace wallets, facilitators, chains, payment protocols, or cloud
deployment. Describe what Lucid adds: typed capability contracts, validation,
payment admission, policy, idempotency, fulfillment, tasks, discovery,
storefronts, and durable accounting.

Do not use a protocol name as a blanket compatibility claim. Every protocol
page must state:

- the upstream version or draft being discussed;
- the exact surface Lucid implements;
- the bindings, schemes, networks, transports, or roles supported;
- upstream features that Lucid does not implement;
- security, persistence, retry, and failure boundaries.

The documentation has five status values:

| Status         | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `stable`       | Public npm surface verified from a clean project.      |
| `next`         | Current repository surface; may be ahead of npm.       |
| `experimental` | Implemented but subject to API or support changes.     |
| `deprecated`   | Historical migration context; not for new work.        |
| `hosted`       | Separately operated product with its own availability. |

Do not mix Stable and Next code in one example. Public npm is the source of
truth for Stable. Repository manifests and the lockfile are the source of truth
for Next. Hosted products need an owner, production URL, authentication model,
limits, data policy, and support path before their pages can present an
integration as available.

## Required frontmatter

Every MDX page must include:

```yaml
---
title: Sell a paid API
description: Define a priced capability and complete one testnet payment.
icon: BadgeDollarSign
status: stable
verifiedVersion: 2.5.0
verifiedAt: 2026-07-21
product: sdk
---
```

Allowed products are `sdk`, `router`, `hosted-platform`, and `provider`.
`verifiedVersion` identifies the artifact checked, not the version the writer
expects to ship. Update `verifiedAt` only after re-running the relevant code or
source audit.

Pages under 150 body words must declare `pageType: index` or
`pageType: boundary`. The content check enforces this so a short task guide
cannot silently masquerade as complete. `index` pages route to full guides;
`boundary` pages state that a product or integration has no verified public
contract. Do not use either value to avoid documenting an implemented task.

## Diataxis content model

Keep reader modes separate even when pages cross-link:

- **Tutorial:** learning-oriented, starts from a clean state, produces a visible
  result within three steps, and ends with what the reader built.
- **How-to:** one concrete job, explicit prerequisites, complete steps,
  verification, troubleshooting, and production consequences.
- **Reference:** exact types, defaults, constraints, side effects, errors,
  exports, and runtime compatibility derived from source.
- **Explanation:** the problem, design, trade-offs, alternatives, and limits.

A short page is acceptable only when its job is genuinely narrow. A task page
is not complete if it gives advice without the command or code needed to act,
or if it omits how to verify success and recover from common failures.

## Code examples

Examples must follow these rules:

1. Prefer a repository source file that is compiled or executed in CI.
2. Include every import and required environment variable in the primary path.
3. Use USD decimal strings for Lucid prices: `'0.01'` means one cent.
4. Use format-bearing placeholders such as `0xYOUR_EVM_ADDRESS`; never include
   a live-format credential.
5. State network costs and on-chain side effects before a command triggers
   them.
6. Do not use development service URLs on Stable pages.
7. Do not copy a large source file into MDX when a focused excerpt plus a
   source link is clearer.

The Stable seller and buyer snippets live in `examples/`. The snippet test
requires the MDX blocks and homepage source import to match those files exactly.

## Links and redirects

Use canonical absolute documentation routes:

```mdx
[Configure policy](/docs/buy/policies-budgets)
```

When moving a page:

1. add the replacement page and navigation entry;
2. add the old path to `src/lib/docs-redirects.ts`;
3. update current pages to link directly to the replacement;
4. run `bun run test:docs`.

Redirects preserve external bookmarks. They are not canonical links for new
content.

External links are checked by `bun run docs:links`. Add an entry to
`../docs/external-links-allowlist.json` only when a source is intentionally
unreachable to automation and the exception is documented.

## Writing style

- Lead with the outcome, then introduce the package or protocol name.
- Define a technical acronym on first use.
- Use sentence-case headings and active voice.
- Explain ownership: Lucid, upstream protocol, external provider, or hosted
  product.
- Distinguish payment evidence from successful application fulfillment.
- Name unsupported features directly; do not use “supports x402/A2A/AP2” as a
  substitute for a compatibility matrix.
- Avoid generic claims such as “production-ready” unless the page names the
  test, persistence, security, and operational evidence behind the claim.

## Documentation checks

| Command                                           | Protects                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bun run content:check`                           | Frontmatter, release rules, page-depth designation, canonical links, redirects, and prohibited stale references. |
| `bun run routes:generate`                         | TanStack route generation.                                                                                       |
| `bun run types:check`                             | MDX generation and TypeScript correctness.                                                                       |
| `bun run examples:test`                           | The local unpaid `402` and paid response loop.                                                                   |
| `bun run build`                                   | Production site bundle.                                                                                          |
| `bun run freshness`                               | Page verification age and owner routing.                                                                         |
| `bun run ../scripts/check-docs-external-links.ts` | Scheduled external-link health.                                                                                  |

## Pull request checklist

- [ ] The page describes an implemented, installable, or explicitly labeled
      surface.
- [ ] Commands and examples were run against the stated release channel.
- [ ] Protocol claims name an exact version and compatibility boundary.
- [ ] Task guides include prerequisites, verification, troubleshooting, and a
      production next step.
- [ ] Package reference matches the package entrypoint and shared type owner.
- [ ] New routes are in `meta.json`; moved routes have redirects.
- [ ] Current pages link to canonical routes rather than redirects.
- [ ] Secret-like examples use unmistakable placeholders.
- [ ] `bun run verify` passes.

## Deployment and telemetry

`bun run deploy` builds and deploys the Cloudflare worker configured in
`wrangler.jsonc`. Deployment credentials and production-domain configuration
are environment-owned and are not committed here.

The site accepts a bounded first-party documentation event contract. It never
accepts arbitrary payload fields, wallet addresses, payment credentials, or
raw search text. Read [Documentation telemetry](./content/docs/reference/docs-telemetry.mdx)
before changing event collection or retention behavior.

## Public Agent Skill

The canonical Lucid Agents skill lives at `.agents/skills/lucid-agents` in the
repository root. Immutable source snapshots live under
`skill-releases/lucid-agents`; generated archives, checksums, manifests, and raw
files are written to `public/skills/lucid-agents` before every docs build and
are intentionally gitignored.

Validate the canonical source and snapshot drift with `bun run skill:validate`.
After changing the skill, increment its `VERSION`, commit the canonical skill,
complete the cross-model evaluation gate, and then run
`bun run skill:release -- /absolute/path/to/results.json`; the release command
rejects missing or failing eval results, dirty canonical source, and existing
version directories. Run `bun run skill:assets` to preview the exact files the
documentation site will serve.

Provider-neutral behavioral cases live under `skill-evals/lucid-agents`. Run
`bun run skill:eval:prepare` to emit one JSONL packet per case, then send those
packets through each target model and a structured rubric judge. Store at least
two models' baseline and skill-assisted scores in one result file, then run
`bun run skill:eval:validate -- /absolute/path/to/results.json`. The gate
requires complete case coverage, no critical failures, a 3.0 skill-assisted
average, no rubric item below 2, and improvement over each non-perfect baseline.
This keeps cross-model evaluation reproducible without placing model credentials
in the repository or coupling the skill release to one provider.
The provider-neutral result shape is documented by
`skill-evals/lucid-agents/results.schema.json`; rubric cardinality and thresholds
are enforced by the validator because they depend on each eval case. Results are
bound to the exact canonical skill-tree and eval-suite SHA-256 digests, both of
which are persisted in release metadata.
