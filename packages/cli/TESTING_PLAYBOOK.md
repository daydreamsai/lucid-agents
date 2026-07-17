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

The matrix covers `hono`, `express`, `tanstack-ui`, `tanstack-headless`, and
`next`. Each generated blank project must:

1. install from packed local packages;
2. pass its TypeScript check;
3. produce a production build;
4. boot that production build on an ephemeral port; and
5. return a valid health response.

Run a single adapter while developing:

```bash
bun run scripts/test-generated-project.ts hono
bun run scripts/test-generated-project.ts next
```

Temporary projects and package archives are created under the operating
system's temporary directory and removed after the run. A failure includes the
command, working directory, stdout, and stderr from the generated project.

The same five-way matrix runs as independent CI jobs so one slow framework does
not hide failures in the others.
