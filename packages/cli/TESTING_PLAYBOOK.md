# Generated Project Testing Playbook

Generated projects are verified as external consumers of packed workspace
artifacts. The test does not copy `dist` folders or rewrite package manifests by
hand: every publishable workspace is packed with `bun pm pack`, installed into a
fresh scaffold through package overrides, then exercised through the same steps
a user runs.

## Run the full adapter matrix

Build the packages and CLI first, then run:

```bash
bun run build:packages
bun run --cwd packages/cli build
bun run test:generated
```

The matrix covers `dossier`, `folio`, and `console` across `hono`, `express`,
`tanstack-ui`, and `next`, plus one `tanstack-headless` project. Each UI project
is generated from `blank`, then enriched with the same deterministic
kitchen-sink fixture: six entrypoints, invoke and stream schemas, A2A tasks,
SIWX, x402, MPP, AP2, security, skills, trust, and validation links. Each case
must:

1. install from packed local packages;
2. pass its TypeScript check;
3. produce a production build;
4. boot that production build on an ephemeral port; and
5. return valid health and Agent Card responses; and
6. render the expected preset/mode marker (or no storefront for headless).

Run a single adapter while developing:

```bash
bun run scripts/test-generated-project.ts hono
bun run scripts/test-generated-project.ts next folio
bun run scripts/test-generated-project.ts tanstack-ui all
```

Temporary projects and package archives are created under the operating
system's temporary directory and removed after the run. A failure includes the
command, working directory, stdout, and stderr from the generated project.

The same 13-case matrix runs as independent CI jobs so one slow framework does
not hide failures in the others. The browser gate additionally runs the static
kitchen-sink page and all three generated Next themes. Cloudflare uploads use a
separate credential-gated three-theme matrix, and Playwright re-runs identity,
information, invocation, responsive, and console checks against every deployed
URL. Local build/browser gates remain mandatory when repository secrets are
absent.
