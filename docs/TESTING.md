# Test and CI Coverage

The repository uses layered tests so failures identify the boundary that broke,
from package logic through packed consumer projects and a real browser.

## Local commands

```bash
bun test
bun run test:coverage
bun run test:e2e
bun run test:generated
bun run test:browser
bun run test:portability
```

`test:ci` is the reporting variant of the full Bun suite. It writes JUnit XML
and LCOV, applies the repository coverage threshold, and fails if the completed
JUnit run contains any failed, errored, or skipped tests. PostgreSQL-backed
tests require both `TEST_POSTGRES_URL` and `TEST_DATABASE_URL`; CI supplies a
PostgreSQL 16 service so those tests run instead of skipping.

## Coverage layers

| Layer               | Boundary covered                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package tests       | Extension lifecycle, validation, authorization, persistence, and protocol behavior                                                                                         |
| Adapter contract    | Every canonical health, discovery, invoke, stream, landing, favicon, OASF, and task route in Hono, Express, and TanStack                                                   |
| Kitchen sink E2E    | Executable boot, TCP HTTP/SSE, A2A task ownership, x402 settlement, SIWX reuse, MPP replay fencing, analytics, scheduler, catalogs, wallet signing, and identity discovery |
| Generated projects  | Packed package installation, typecheck, production build, boot, and health for all five CLI adapters                                                                       |
| Browser smoke       | Chromium render, manifest hydration, entrypoint visibility, and a zero-error browser console                                                                               |
| Runtime portability | Published entrypoint imports under supported Node versions and edge-like constraints                                                                                       |
| Documentation       | Documentation type generation and production build                                                                                                                         |

## CI jobs

CI is split into independent jobs for static checks, database-backed tests and
coverage, examples E2E, generated adapter projects, Chromium smoke, Node 20/22
portability, and docs. JUnit, LCOV, browser logs, snapshots, and screenshots are
uploaded even when their producing job fails.

Release and SDK regeneration workflows use the repository's pinned Bun version.
SDK regeneration must also typecheck and build before it can commit generated
sources.
