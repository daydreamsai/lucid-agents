# Contributor architecture

Use this reference when editing the Lucid monorepo rather than only consuming packages.

Core owns the typed extension DAG and one canonical entrypoint registry. Domain packages own complete runtimes. HTTP owns fetch-native handlers, route planning, SSE, and the shared authorization transaction. Hono, Express, TanStack, and generated Next.js modules only adapt those handlers. Deploy remains tooling-only.

Repository principles:

- Define one public type per concept in `@lucid-agents/types` or the owning package.
- Expose complete runtimes directly; avoid wrappers, synchronization layers, and duplicate config states.
- Do not re-export values or types from other packages.
- Keep ESM, strict TypeScript, explicit types, kebab-case source files, and Zod schemas.
- Add complexity in the package that owns the domain.
- Preserve unrelated work in a dirty tree.

Public SDK changes require package tests, relevant README and JSDoc updates, a changeset, and a smoke case in `packages/examples/src/__tests__/smoke.test.ts`. Adapter contract changes require coverage across affected adapters. Build with the manifest-derived topological build and run portability checks for runtime packages.

Trace before editing:

1. Shared contract in `packages/types/src/`.
2. Owning extension runtime and tests.
3. HTTP route or authorization transaction if public transport changes.
4. Adapter binding only if translation changes.
5. CLI templates, examples, docs, and changeset.

Do not solve a domain problem by adding an adapter-local special case.
