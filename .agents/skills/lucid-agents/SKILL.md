---
name: lucid-agents
description: Build, modify, review, debug, or deploy TypeScript services made with the Lucid Agents SDK. Use whenever a project imports @lucid-agents packages or the user asks about Lucid runtimes, entrypoints, adapters, payments, MPP, identity, wallets, A2A tasks, service UI, scaffolding, or deployment.
---

# Lucid Agents

Use this skill to make changes that match the installed Lucid release channel and preserve the framework's extension-owned architecture. Inspect the project before proposing code; package versions and generated adapter shape are part of the API.

## Start with project evidence

Run the bundled inspector from the skill directory:

```bash
node scripts/inspect-project.mjs /absolute/path/to/project
```

Read its JSON before editing. Also inspect the project's `package.json`, lockfile, `AGENTS.md`, agent builder, adapter bootstrap, entrypoint definitions, and `service-ui.config.ts` when present.

Treat its channel result as a guardrail:

- `stable`: use APIs present in the installed registry package versions.
- `next`: use the checked-out workspace source and package READMEs as truth.
- `mixed`: stop implementation until the user selects registry packages or local/workspace packages consistently.
- `unknown`: locate the actual Lucid dependency source before writing SDK code.

Never silently upgrade packages, replace an adapter, add a payment protocol, or change a public route. State such changes explicitly and get authorization when they expand the request.

## Use the source-of-truth order

When examples disagree, prefer evidence in this order:

1. Installed TypeScript declarations and package source for the project's exact version.
2. Package README and tests for that same version or checkout.
3. Generated template files and their local `AGENTS.md`.
4. This skill's references.
5. General documentation, blog posts, or memory.

Do not invent an API to reconcile conflicting examples. Explain the version mismatch and choose the form supported by the project.

## Preserve the runtime model

- Compose capabilities with `createAgent(...).use(extension()).build()`.
- Let each domain package own its runtime behavior and configuration.
- Register every public operation once as a typed entrypoint.
- Let adapters bind `runtime.http.routes` or delegate to `runtime.http.handlers`.
- Do not create adapter-local registries, paywalls, manifests, or authorization flows.
- Keep secrets server-side and read them from environment variables.
- Use durable stores for production state that must survive process restarts.
- Prefer the project's existing package versions and patterns over a broad refactor.

For runtime and entrypoint code, read [runtime-entrypoints.md](references/runtime-entrypoints.md). For extension ownership and monorepo changes, read [contributor-architecture.md](references/contributor-architecture.md).

## Route to the smallest relevant reference

- Package channels, version drift, upgrades, or mixed dependencies: [release-channels.md](references/release-channels.md)
- CLI generation, Hono, Express, TanStack, or Next.js: [adapters-scaffolding.md](references/adapters-scaffolding.md)
- x402 pricing, SIWX, policies, settlement, or analytics: [x402-payments.md](references/x402-payments.md)
- MPP challenges, Tempo, Stripe, or custom credentials: [mpp.md](references/mpp.md)
- Wallet setup, ERC-8004 registration, trust, or reputation: [identity-wallets.md](references/identity-wallets.md)
- Agent Cards, A2A invocation, tasks, scheduler, or catalogs: [discovery-tasks.md](references/discovery-tasks.md)
- Dossier, folio, console, semantic tokens, or service pages: [service-ui.md](references/service-ui.md)
- Provider commands, manifests, environment handling, or production readiness: [deployment-production.md](references/deployment-production.md)
- Build failures, routing errors, authorization failures, or portability: [troubleshooting.md](references/troubleshooting.md)

If the bundle is incomplete, fetch the matching file from `https://docs.daydreams.systems/skills/lucid-agents/references/` and keep the skill version fixed while doing so.

## Implement in a narrow loop

1. Establish the installed channel, adapter, extensions, base path, and state stores.
2. Find the closest existing entrypoint or template and trace it through the runtime to its adapter.
3. Define input and output with Zod; keep handler output aligned with the declared schema.
4. Add or modify the owning extension only when the behavior belongs to that domain.
5. Test the smallest package first, then the affected adapter or example.
6. If public SDK surface changes, add the repository's required cross-package smoke test and documentation.
7. Re-run the inspector and ensure no mixed-channel dependency was introduced.

Use Bun commands when the project is Bun-based. In the monorepo, typical checks are:

```bash
bun test packages/<package>/src/__tests__
bunx tsc --noEmit -p packages/<package>/tsconfig.json
bun test packages/examples/src/__tests__/
bun run build:packages
```

Choose checks proportional to the change; do not claim verification you did not run.

## Review before handing off

Confirm all of the following:

- The code matches the project's actual Lucid versions.
- Extension order and dependencies are valid.
- Entrypoint keys, input, output, price, and payment protocol are explicit where needed.
- Adapter code delegates to the canonical HTTP runtime.
- Payment and identity secrets cannot reach client bundles or logs.
- In-memory state is not presented as durable production storage.
- Public SDK changes include tests, docs, and a changeset when the repository requires them.
- The final response names changed behavior, checks run, and any deployment or migration step.

## Skill release

This bundle is versioned independently from npm packages. Read `VERSION` for the skill version. A release manifest and SHA-256 checksum are published beside the archive. Do not mix files from different skill versions.
