# Generated Agent Service UI

Lucid Agents generates a service storefront with an embedded invocation
workspace. The interface exists to explain an agent's public offering, establish
trust, and let a developer try or integrate a capability. It is not an
operations dashboard and must not expose private runtime state.

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

@lucid-agents/cli/adapters/ui
  src/components             shared React storefront
  src/lib                    schema, protocol, stream, task, and state helpers
  src/styles                 shared visual system

Framework adapters
  Next                       routes, server loading, providers, metadata
  TanStack                   routes, server loading, providers, document shell
```

Framework adapters may adapt request signatures and routing conventions. They
must not fork service semantics or duplicate the storefront.

## Visual system

The visual posture is a quiet technical dossier. The agent's identity is
primary; Lucid attribution is a small footer signature.

| Token      | Value     | Use                                       |
| ---------- | --------- | ----------------------------------------- |
| Canvas     | `#0B0D0C` | Page background                           |
| Surface    | `#111512` | Readiness and result regions              |
| Ink        | `#EDF2EB` | Primary content                           |
| Muted      | `#8D978F` | Supporting content                        |
| Rule       | `#29302B` | Structural separation                     |
| Accent     | `#7EE2A8` | Readiness, success, primary action        |
| Accent ink | `#07120C` | Text placed on the accent color           |
| Warning    | `#E3B965` | Authorization and payment readiness       |
| Error      | `#FF8B82` | Invalid, mismatch, and recoverable errors |
| Code       | `#080A09` | Schemas, payloads, results, and snippets  |

All interface text uses IBM Plex Mono when available and a system monospace
fallback. The identity heading is text-only: published agent icons and generated
monograms are deliberately omitted to keep the hierarchy quiet. Controls use a
four-pixel radius; overlays may use eight pixels. Shadows are reserved for
overlays. Functional transitions last 120–180ms and are disabled when reduced
motion is requested.

The first release is dark-only. Generated pages do not include a theme toggle.

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
creation, task polling, and cancellation. Portable HTML invokes and streams free
operations directly. It explains protected operations and provides integration
examples without requesting credentials.

Invocation input, output, task access, payment credentials, and errors remain
in memory for the page session. Generated UI must not write them to browser
storage. Visible errors redact authorization, credential, token, receipt, and
signature material.

## Responsive and accessible behavior

- At 1200px and wider, offerings use a 320px rail beside the workspace.
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
5. generated Next and TanStack type-check, production build, boot, and health;
6. Hono, Express, and TanStack-headless generated-project verification;
7. browser checks at desktop and mobile widths, including keyboard focus and
   console errors;
8. the repository type-check, build, test, coverage, portability, and E2E gates.

Generated-project verification must use packed workspace artifacts. Installing
the published `latest` versions can silently test code from before the current
refactor.
