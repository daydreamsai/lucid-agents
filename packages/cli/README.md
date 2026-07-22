# @lucid-agents/cli

Scaffold a Lucid service for Hono, Express, TanStack Start, or Next.js. The CLI
copies a template, applies one adapter, writes wizard values to the generated
environment files, and optionally installs dependencies. It is a project
generator, not a runtime dependency.

## Choose a release channel

The public npm package set is Stable. This repository can be ahead of npm, so
pin one channel and inspect the generated dependency versions before install.

Stable:

```bash
bunx @lucid-agents/cli@2.5.0 my-service \
  --adapter=hono \
  --template=blank
```

Current repository (Next):

```bash
bun run build:packages
bun packages/cli/dist/index.js my-service \
  --adapter=hono \
  --ui-preset=folio \
  --template=blank \
  --no-install
```

Do not use `@latest` in reproducible automation. Repository templates track the
Next workspace and are not proof that the same package versions are available
on npm.

## Templates

| Template                       | Purpose                                                       | Adapters                                     |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------------- |
| `blank`                        | Minimal typed service and starting capability                 | Hono, Express, TanStack UI/headless, Next.js |
| `identity`                     | Wallet, ERC-8004 identity metadata/registration, and payments | Hono, Express, TanStack UI/headless, Next.js |
| `trading-data-agent`           | Legacy merchant example; requires v3 template migration       | Hono, Express                                |
| `trading-recommendation-agent` | Legacy buyer example; requires v3 template migration          | Hono, Express                                |

The generated-project verification matrix currently covers `blank` across all
five adapters. The two trading templates still contain pre-v3 composition and
are not a supported starting point until their generated source, dependencies,
and paid task calls are migrated and added to that matrix. Their documentation
records the target contract. They are also not a claim of conformance with the
official A2A v1 transport or task model.

## Adapters

| Adapter             | Generated shape                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `hono`              | Hono application plus a static, read-only public storefront                                           |
| `express`           | Express application plus a static, read-only public storefront                                        |
| `tanstack-ui`       | TanStack Start routes plus a public service storefront                                                |
| `tanstack-headless` | TanStack Start routes without the storefront                                                          |
| `next`              | Next.js App Router modules plus the shared storefront; there is no standalone Next.js adapter package |

The generated UI is a minimal, read-only endpoint directory. Every invoke and
stream operation appears in a table with its HTTP path, payment method, and
price. Detailed schemas and the complete Agent Card remain available from the
public API rather than being repeated as JSON in the page. TanStack headless
deliberately generates neither the directory nor its config.

Every UI-capable adapter writes one editable `service-ui.config.ts`. Choose
`dossier` (dark mono), `folio` (light editorial), or `console` (compact dark).
The file supports only validated semantic color and font tokens; all presets
keep the same endpoint-table layout.

## Options

```text
Usage: bunx @lucid-agents/cli <app-name> [options]

  -t, --template <id>   Select a template
  -a, --adapter <id>    Select an adapter
  -i, --install         Run bun install after scaffolding
  --no-install          Skip installation (default)
  --no-deploy           Omit deployment tooling and configuration
  --wizard=no           Use template defaults
  --no-wizard           Alias for --wizard=no
  --non-interactive     Alias for --wizard=no
  --ui-preset <id>      Select dossier, folio, or console
  --network=<network>   Map a payment-network value to PAYMENTS_NETWORK
  --KEY=value           Supply a template wizard value in non-interactive mode
  -h, --help            Show installed CLI help
```

`--framework` is accepted as a compatibility alias for `--adapter`.

## Reproducible non-interactive generation

Supply the template, adapter, and every deployment-sensitive value. Prefer a
canonical CAIP-2 network even though the wizard accepts historical aliases.

```bash
bunx @lucid-agents/cli@2.5.0 paid-service \
  --adapter=hono \
  --template=blank \
  --non-interactive \
  --no-install \
  --AGENT_DESCRIPTION='Paid analysis service' \
  --AGENT_VERSION='0.1.0' \
  --PAYMENTS_FACILITATOR_URL='https://YOUR_TESTNET_FACILITATOR' \
  --PAYMENTS_NETWORK='eip155:84532' \
  --PAYMENTS_DESTINATION='static' \
  --PAYMENTS_RECEIVABLE_ADDRESS='0xYOUR_EVM_ADDRESS'
```

Then:

```bash
cd paid-service
sed -n '1,200p' .env.example
bun install
bunx tsc --noEmit
bun run dev
```

Review the generated `package.json`, `.env.example`, entrypoint prices, public
origin/base path, and facilitator before deploying. A template default is not a
production provider recommendation.

There is no `PAYMENTS_DEFAULT_PRICE` runtime variable. Prices belong on each
entrypoint as USD decimal strings. The wallet helper uses role-specific names
such as `AGENT_WALLET_PRIVATE_KEY` and `DEVELOPER_WALLET_PRIVATE_KEY`; a generic
`PRIVATE_KEY` is not the current documented contract.

## Wizard behavior

1. The CLI selects a compatible adapter and template.
2. `--KEY=value` answers are used only in non-interactive/skip-wizard mode.
3. Unspecified answers fall back to `defaultValue` in the template's
   `template.json`.
4. Conditional prompts are included only when their `when` rule matches.
5. Stripe destination mode forces the generated payment network to Base.
6. UI-capable adapters select a storefront preset and write the typed root
   `service-ui.config.ts` file.
7. Adapter files and template sections are composed into the project.
8. `.env` and `.env.example` are generated; template metadata is removed.
9. Dependencies are installed only with `--install`.

The target directory must be empty. If no project name is supplied, the CLI
derives one from the selected template.

## Generated project contract

The exact files vary by adapter, but every project should keep these
boundaries:

- one completed Lucid runtime owns the canonical entrypoint registry;
- `@lucid-agents/http` owns payment/SIWX authorization and route handlers;
- the framework adapter binds those routes instead of adding another paywall;
- private configuration stays server-side; and
- public storefronts derive data from Agent Card and health handlers.

After generation, add one capability at a time and test:

```bash
bunx tsc --noEmit
curl -i http://localhost:3000/health
curl -i http://localhost:3000/.well-known/agent-card.json
```

For a priced route, verify the unpaid request returns x402 `402` before funding
a buyer. Use the repository's Stable quickstart for the complete paid loop.

## Deployment-ready blank Hono projects

The current repository scaffold makes the `blank` + `hono` combination
Cloudflare-ready by default. It adds a separate fetch-native Worker entry,
`wrangler.jsonc`, a versioned `lucid.deploy.json`, and the `bun run deploy`
command while preserving the normal Bun server for local development.

```bash
bunx wrangler login
bun run deploy
```

The default command uploads a Worker version with a preview alias and never
deploys production. `@lucid-agents/deploy` uploads only manifest-allowlisted
environment values, uses Worker secrets for secret-classified values, forces
preview identity auto-registration off, prints a redacted plan, and verifies
the landing page, health endpoint, and canonical Agent Card at the returned
URL. CI requires both `CLOUDFLARE_API_TOKEN` and `--yes`.

Pass `--no-deploy` while scaffolding to omit the deploy package, Wrangler,
Worker entry, manifest, provider configuration, command, and deployment README
section. Other template/adapter combinations remain unchanged until their
provider drivers are added.

## Template development

Template source lives in `packages/cli/templates/`; framework assets live in
`packages/cli/adapters/`. When changing either:

```bash
bun run --cwd packages/cli build
bun test packages/cli/tests
```

Generate every compatible adapter/preset pair with `--no-install`, inspect the
transformed files, then install/type-check the changed combinations. The CI
matrix covers 12 UI combinations plus one headless project. UI cases receive a
deterministic kitchen-sink Agent Card after scaffolding so schemas, streaming,
tasks, SIWX, x402, MPP, AP2, trust, and security stay portable together. Update
the template schema, `AGENTS.md`, and README when adding wizard keys or public
behavior.

## Programmatic API

```ts
export { runCli } from '@lucid-agents/cli';
export type { PromptApi, RunLogger } from '@lucid-agents/cli';
```

## Troubleshooting

- **Unknown template/adapter:** run `--help` and choose a compatible pair.
- **Target exists:** choose an empty directory; the CLI does not merge into an
  existing tree.
- **Generated install fails:** inspect package versions before running
  `bun install`; do not mix Stable and Next packages.
- **Priced route is free:** confirm the entrypoint has an explicit price and
  the matching payment extension/configuration is installed.
- **Identity registration fails:** identity uses an EVM developer/agent signer
  even when the service receives x402 payments on Solana.

See the [public CLI reference](../../lucid-docs/content/docs/packages/cli.mdx),
[release channels](../../lucid-docs/content/docs/reference/release-channels.mdx),
and [environment inventory](../../lucid-docs/content/docs/reference/environment.mdx).

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md).
