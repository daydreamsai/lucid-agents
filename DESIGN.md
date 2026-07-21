# Generated Agent Service UI

Lucid Agents generates a public service storefront in three selectable designs.
The interface exists to explain an agent's public offering and establish trust.
React adapters also provide an invocation workspace; portable server adapters
remain read-only. It is not an operations dashboard and must not expose private
runtime state.

## Product contract

The first screen must answer five questions:

1. What does this agent do?
2. Is the service available and trustworthy?
3. Which outcomes does it offer?
4. What does each operation cost and which protocol protects it?
5. How can a user run or integrate it?

The information hierarchy is:

```text
Agent identity, health, and trust
  Purpose
  Offerings
    Outcome, price, protocol, and execution mode
  Selected offering
    Schema-derived input
    Authorization and payment readiness
    Result, stream, or task lifecycle
    Integration details
  Public service details
    Agent Card, endpoints, trust, payments, and extensions
```

## Data ownership

The public Agent Card and health response are the source of truth. The HTTP
package turns them into a framework-neutral `ServicePageModel` using
`buildServicePageModel()`. Portable HTML, generated Next applications, and
generated TanStack applications consume that model.

UI code must not read `runtime.entrypoints.snapshot()`, payment configuration,
wallet configuration, or agent metadata directly. If information is necessary
to describe a public operation, publish it through the Agent Card first.

The Agent Card entrypoint record publishes:

- input and output schemas;
- invoke and stream prices;
- the selected x402 or MPP payment protocol;
- the entrypoint-specific network;
- public SIWX requirements.

Internal analytics, scheduler, catalog, storage, and wallet state are never
shown unless a package deliberately publishes a corresponding public
capability descriptor.

## Renderer ownership

```text
@lucid-agents/http
  service-page-model.ts      public model builder
  landing-page.ts            portable Hono/Express renderer
  service-ui/index.ts        presets, validation, tokens, and shared CSS

@lucid-agents/cli/adapters/ui
  src/components             shared React storefront
  src/hooks                  shared browser invocation controller
  src/lib                    schema, protocol, stream, task, and state helpers

Framework adapters
  Next                       routes, server loading, providers, metadata
  TanStack                   routes, server loading, providers, document shell
```

Framework adapters may adapt request signatures and routing conventions. They
must not fork service semantics or duplicate the storefront.

## Presets and design tokens

Every renderer consumes the same resolved semantic tokens and emits the same
information regions. Presets change composition and visual tone, not service
semantics:

| Preset    | Posture                | Scheme | Layout character                              |
| --------- | ---------------------- | ------ | --------------------------------------------- |
| `dossier` | Quiet technical record | Dark   | Existing 320px offering rail and mono density |
| `folio`   | Editorial field guide  | Light  | Large serif identity and card-like contracts  |
| `console` | Dense operator console | Dark   | Compact grid and high-information scan lines  |

The root `service-ui.config.ts` is the single user-owned configuration file.
`defineServiceUi()` gives it contextual types; `resolveServiceUi()` validates it
at runtime. Users may select a preset and override semantic colors or ordered
font stacks. Layout CSS, arbitrary selectors, script injection, and unknown
keys are not accepted. Colors must be six-digit hex values and pass the
renderer contrast checks. Font stylesheets must use HTTPS or a same-origin
path.

The identity heading is text-only: published agent icons and generated
monograms are deliberately omitted to keep the hierarchy quiet. Functional
transitions are disabled when reduced motion is requested. There is no runtime
theme toggle; changing the typed config creates a deterministic deployment.

## Interaction lifecycle

The shared invocation reducer exposes these user-visible phases:

```text
ready
  invalid
  preparing
  authorization
  payment
  network-mismatch
  running
  partial
  success
  recoverable-error
  cancelled
```

React renderers support SIWX, x402, MPP credential submission, SSE, A2A task
creation, task polling, and cancellation. Portable Hono and Express HTML is a
static documentation surface: it includes schemas, examples, cURL snippets,
prices, security, payments, trust, capabilities, skills, endpoints, and the raw
Agent Card, but ships no client JavaScript and never submits an API request.

Invocation input, output, task access, payment credentials, and errors remain
in memory for the page session. Generated UI must not write them to browser
storage. Visible errors redact authorization, credential, token, receipt, and
signature material.

## Responsive and accessible behavior

- Dossier uses a 320px desktop rail; Folio and Console use their own responsive
  grid while preserving the same semantic reading order.
- Between 768px and 1199px, the rail compacts and the workspace remains primary.
- Below 768px, selecting an offering drills into its workspace.
- Below 480px, code editors become edge-to-edge and the primary action remains
  reachable in a sticky action row.
- Controls provide a minimum 44px target.
- Body copy starts at 16px and auxiliary labels at 12px.
- Selection is represented in the URL and invocation state remains in memory.
- Every payload editor has a unique label and identifier.
- Run, stream, payment, authorization, and task updates use a polite live region.
- Focus indicators, keyboard navigation, reduced motion, and non-color status
  labels are required.

## Verification

Renderer changes require:

1. public model unit tests;
2. portable renderer behavior tests;
3. shared client and lifecycle tests;
4. CLI layering and generated-file tests;
5. a generated-project matrix that enriches all three presets with the same
   deterministic kitchen-sink Agent Card across Hono, Express, Next, and
   TanStack UI, plus one TanStack-headless project;
6. browser checks for the static kitchen-sink page and all three interactive
   Next previews at desktop and mobile widths;
7. credential-gated Cloudflare Worker preview uploads for all three presets,
   followed by Playwright checks against each deployed URL;
8. the repository type-check, build, test, coverage, portability, and E2E gates.

Generated-project verification must use packed workspace artifacts. Installing
the published `latest` versions can silently test code from before the current
refactor.
