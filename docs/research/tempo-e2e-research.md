# Tempo end-to-end testing without rebuilding a blockchain

**Research date:** 25 July 2026

**Repository baseline:** `96666ac`

**Scope:** Native MPP Tempo charge and TIP-1034 session coverage in Lucid Agents
**Method:** Repository inspection plus primary upstream specifications, source,
releases, and CI workflows

## Executive decision

Lucid should not emulate Tempo, deploy a channel contract, or run a validator
network. The smallest honest end-to-end boundary is one official Tempo node in
ephemeral development mode:

```text
mppx payer
  -> Lucid HTTP endpoint
  -> mppx server verification
  -> local Tempo JSON-RPC
  -> native TIP-20 / TIP-1034 execution
  -> receipt, event, balance, store, and accounting assertions
```

TIP-1034 is a protocol-native precompile at
`0x4D50500000000000000000000000000000000000`. Its channel reserve and
`open`, `topUp`, `settle`, `requestClose`, `close`, and `withdraw` operations
are part of Tempo itself, so there is no Solidity escrow to deploy. The
[official TIP-1034 specification](https://github.com/tempoxyz/tempo/blob/v1.11.0/tips/tip-1034.md)
defines that boundary.

This is also the upstream-tested approach. The required `mppx@0.8.14` workflow
runs one `ghcr.io/tempoxyz/tempo` container with `tempo node --dev`, 200 ms
blocks, a deterministic local mnemonic, built-in TIP-20 faucets, and a
JSON-RPC readiness probe. It does not start validators or use Anvil. See the
[mppx 0.8.14 verification workflow](https://github.com/wevm/mppx/blob/mppx%400.8.14/.github/workflows/verify.yml#L74-L190).

The recommended split is:

| Lane               | Boundary                     | Blocking?    | Purpose                                                                                    |
| ------------------ | ---------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Unit and component | In-memory/fake clients       | Yes          | Exhaustive Lucid state-machine, validation, and failure logic                              |
| Local Tempo E2E    | One pinned official dev node | Yes          | Real signatures, transactions, precompile state, receipts, balances, and Lucid integration |
| Moderato canary    | Public testnet and faucet    | No initially | Public RPC, deployed hardfork, faucet, and network compatibility                           |

The dependency cohort must be corrected before building the lane. The current
repository pins `mppx@0.8.13` and Viem `2.55.2`. The first implementation spike
should prove and then pin an exact cohort based on:

- `mppx@0.8.14`, which fixes Tempo session management transactions to use
  expiring nonces and fixes automatic top-up/resume behavior. See the
  [0.8.14 release](https://github.com/wevm/mppx/releases/tag/mppx%400.8.14)
  and [expiring-nonce fix](https://github.com/wevm/mppx/commit/a3a0d82623db2630ecec890d67ea1e4fa5eeed01).
- Viem `2.55.8` as the initial exact candidate. `2.55.7` contains the required
  fix that preserves a relay fee-payer signature after
  `eth_fillTransaction`; `2.55.8` additionally fixes gas estimation for
  sponsored access-key transactions prepared without a gas value. See
  [Viem PR 4880](https://github.com/wevm/viem/pull/4880),
  [Viem 2.55.7](https://github.com/wevm/viem/releases/tag/viem%402.55.7), and
  [Viem 2.55.8](https://github.com/wevm/viem/releases/tag/viem%402.55.8).

Do not merge a range and hope that the peer dependency is sufficient. First
prove one charge and one session open against the pinned node, run the existing
suite, then commit the exact versions and lockfile together.

## What the repository proves today

The current `payment_e2e` CI job is a valuable deterministic conformance gate,
but it does not execute a Tempo transaction. The Tempo session example uses
fake clients whose RPC path must not be called, seeds a signed channel and
voucher into SQLite, then exercises Lucid invoke, SSE metering, accounting, and
restart behavior. This is good component coverage; it is not chain E2E.

Current coverage already gives a strong base:

- `tempo.session()` configuration and coexistence with Tempo charge.
- HMAC challenge verification and session authorization wiring.
- One-unit invoke accounting.
- SSE reservation, delivered-unit reconciliation, cancellation, and rollback.
- Atomic in-memory and SQLite channel state.
- SQLite restart and concurrent meter behavior.
- Optional Postgres serialization tests when a database is provided.
- Agent Card/OpenAPI projection and rejection of unsupported task sessions.

The missing boundary is the one a user has not exercised: a public `mppx`
buyer signing a real credential, the server broadcasting or validating the
corresponding transaction, Tempo applying TIP-20/TIP-1034 state changes, and
Lucid reconciling that result through restart and concurrency.

There is one asymmetry to address before the two Tempo rails can share the
local node:

- The session descriptor already accepts `chainId` and `getClient`, and Lucid
  forwards both to `mppx`. It can therefore be pointed at the local RPC once
  the dependency cohort is upgraded.
- The charge descriptor declares an optional `chainId`, but Lucid does not
  forward it to `mppx`, and its public config has no `getClient`/RPC resolver.
  A real local charge test should first fail through the public config, then
  add the smallest typed client-resolution surface and forward it. Do not make
  the E2E test depend on mutating global RPC environment variables.

This is a Lucid integration gap, not a reason to build a chain harness. It can
be solved independently of the session lifecycle and should not hold the
TIP-1034 test lane behind a larger charge API redesign.

## Why the official dev node is the right boundary

### It exercises native Tempo behavior

The [Tempo session draft](https://paymentauth.org/draft-tempo-session-00.html)
defines a unidirectional incremental-payment channel. The payer deposits funds,
signs cumulative off-chain vouchers, the payee settles the latest voucher, and
the parties cooperatively close or use the request-close grace path. The draft
also requires linearizable server accounting and persistence before service
delivery.

The dev node executes:

- Tempo transactions and two-dimensional nonces.
- TIP-20 balance and fee behavior.
- The TIP-1034 channel-reserve precompile.
- Transaction estimation, broadcast, mining, receipts, and logs.
- The exact typed data and chain/domain binding used by the SDK.

A mocked JSON-RPC client proves none of those. Ordinary EVM Anvil can be useful
for EVM compatibility work, but using it as the primary Tempo session oracle
would create a second implementation of the hardfork and precompile semantics
that the test is meant to verify.

Tempo's current Foundry tooling includes first-class Tempo support, including
Anvil, but the SDK owner tests `mppx` against the official Tempo node. Lucid
should follow that tested cohort and avoid an additional execution-client
variable. See the
[official Tempo Foundry guide](https://tempo.xyz/developers/docs/sdk/foundry)
for the alternative and the
[mppx workflow](https://github.com/wevm/mppx/blob/mppx%400.8.14/.github/workflows/verify.yml#L137-L174)
for the chosen precedent.

### It is one process, not a miniature network

Development mode embeds the chain specification and mines locally. Required CI
needs only one container and one HTTP RPC port. It needs no:

- validators, consensus quorum, or peer discovery;
- network synchronization or persistent chain data;
- generated genesis file;
- deployed escrow/channel bytecode;
- cloud RPC, faucet, API key, or long-lived wallet secret.

### It is portable across developer and CI machines

Use a reviewed, multi-architecture OCI index digest rather than a tag. Tempo's
source releases and GHCR image tags do not currently share a version scheme;
in particular, a Tempo source release must not be assumed to have a
same-numbered container tag. On the research date, the `latest` image used by
upstream `mppx` resolved to this OCI index:

```text
ghcr.io/tempoxyz/tempo@sha256:fd3912451658118f54625d122b37fd35e0dc2fe2192f99d9941f1a468dd4d97c
```

Its OCI metadata reports the `edge` version and source revision
`0dcf32250f0ff29791b5940e30c9084232cd6d43`; the index contains both
`linux/amd64` and `linux/arm64` manifests. That lets the same pinned reference
select the native image on GitHub's x64 Ubuntu runner and an Apple Silicon
development machine. The digest is an observed candidate, not a permanent
recommendation: re-resolve it, inspect its platforms and source labels, and
verify its signature in the cohort spike. Tempo documents official GHCR images
and Cosign verification against its GitHub Actions identity in the
[node installation guide](https://tempo.xyz/developers/docs/guide/node/installation).

Pin the multi-arch index digest in CI. Do not pin only one architecture
manifest, and do not use `latest`, a nightly image, or an unreviewed automatic
upgrade in the required lane.

## Dependency and protocol cohort

The node, `mppx`, and Viem versions form one compatibility cohort. Track them
together in the support matrix and in test evidence:

| Component           | Candidate                                                                 | Reason                                                                              |
| ------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Tempo node          | exact candidate OCI index `sha256:fd391…d97c`, source revision `0dcf322…` | Same multi-arch build selected by upstream `mppx`, made immutable by digest         |
| `mppx`              | exactly `0.8.14`                                                          | Expiring-nonce and top-up/resume fixes required for real TIP-1034 management        |
| Viem                | exactly `2.55.8` initially                                                | Includes relay signature preservation and sponsored access-key gas estimation fixes |
| Chain               | Tempo localnet, ID `1337` (`0x539`)                                       | Upstream local SDK configuration and an explicit public-RPC safety fence            |
| Asset and fee token | local `pathUSD`                                                           | One stable token for payment and fees; no AMM bootstrap                             |

The session management fix matters even without a relay. TIP-1009 expiring
transactions use nonce `0`, the expiring nonce key, and a bounded validity
window. The `mppx@0.8.14` precompile integration test asserts the corrected
shape for both sponsored and unsponsored operations. See the
[official TIP-1009 specification](https://github.com/tempoxyz/tempo/blob/v1.11.0/tips/tip-1009.md)
and
[mppx precompile integration test](https://github.com/wevm/mppx/blob/mppx%400.8.14/src/tempo/session/precompile/Chain.integration.test.ts).

Do not patch around `0.8.13` by manually supplying a regular nonce, hard-coded
gas, or locally altered typed data. That would make Lucid responsible for
protocol behavior already fixed upstream.

## Minimal local-node contract

Lucid should own a small test orchestrator, not a general blockchain harness.
Its contract should be:

1. Resolve the exact pinned image reference.
2. Start one named container with an ephemeral data directory.
3. Run `tempo node --dev` with the upstream-tested deterministic mnemonic,
   200 ms block time, built-in faucet assets, loopback-published HTTP RPC, and
   the engine flags used by `mppx`.
4. Poll `eth_chainId` with a bounded deadline; require `0x539`.
5. Refuse to run deterministic test keys unless the RPC host is loopback and
   the chain ID is `1337`.
6. Fund isolated payer and payee accounts with local `pathUSD`.
7. Run charge and session scenarios sequentially against the same node.
8. Restart Lucid and its store clients independently; keep the node alive so
   recovery is tested against unchanged chain state.
9. On failure, retain only redacted diagnostics.
10. Always stop and remove the container and ephemeral data.

The upstream harness mints or transfers extra assets for broader SDK tests.
Lucid can be smaller: use the built-in `pathUSD` asset for payment and Tempo
fees, and transfer/faucet only the payer and any account that must submit a
transaction. Tempo does not require a native gas token; fees are paid in USD
TIP-20 tokens with `pathUSD` as the fallback. See the
[Tempo fees specification](https://tempo.xyz/developers/docs/protocol/fees).
Avoiding custom tokens and AMM initialization removes setup steps that do not
increase Lucid coverage.

Use receipt polling and event/state reads with deadlines. Do not use arbitrary
sleeps, fixed transaction hashes, or hard-coded gas estimates. Generated salts
and transaction hashes may vary; assertions should target invariants.

## Required charge E2E scenarios

Write every scenario as a failing test before adding its harness or production
fix.

### Happy path

1. Start a real Lucid Hono service with native `tempo.server()`.
2. Send a request without payment and assert a standards-shaped `402`
   challenge bound to method, target, and request.
3. Let the public `mppx` client parse the challenge and sign the credential.
4. Retry through the public HTTP surface.
5. Assert exactly one on-chain TIP-20 transfer with the expected token, payer,
   payee, and amount.
6. Assert successful transaction receipt, Lucid handler execution exactly
   once, `Payment-Receipt`, and payment accounting.
7. Reconcile payer/payee payment-token deltas. Account for fees separately
   rather than requiring payer delta to equal only the sale amount.

This must not call Lucid's verifier directly. The test boundary starts at
client HTTP and ends in both Lucid state and Tempo state.

### Negative and ambiguity cases

At minimum:

- malformed or invalid signature;
- wrong chain, token, recipient, amount, expiry, request target, or body;
- replay of an accepted credential;
- concurrent duplicates;
- insufficient balance;
- broadcast/reconciliation timeout;
- handler failure after a payment has committed.

For every rejected pre-payment case, prove no on-chain transfer and no handler
execution. For a concurrent duplicate, prove at most one transfer and at most
one handler execution. For a handler failure after irrevocable payment, assert
the documented truthful outcome: no false success, no retry double-charge, and
an accounting/receipt trail that records the committed payment.

## Required TIP-1034 session E2E scenarios

### Open and first use

1. A public `mppx` session manager receives the `402` session challenge.
2. It prepares an expiring-nonce open transaction and signs the open
   credential.
3. Lucid/mppx validates and broadcasts it to the real precompile.
4. Assert the `ChannelOpened` event and on-chain channel descriptor:
   payer, payee, authorized signer, token, salt/channel ID, chain, and deposit.
5. Assert the management transaction has nonce `0`, the expiring nonce key,
   and a validity deadline.
6. Complete the paid invoke and assert the first cumulative voucher, Lucid
   spent value, response receipt, and handler count.

### Continued use, streaming, and top-up

- Submit multiple requests and prove vouchers are cumulative and strictly
  monotonic rather than per-request transfers.
- Exercise SSE completion and client cancellation. Reconcile the charged amount
  to authoritative delivered units, not requested or buffered units.
- Exhaust the configured usable balance enough to trigger an automatic top-up.
- Assert the same channel remains in use, the on-chain deposit increases, and a
  `TopUp` event is emitted.
- Force the HTTP request after a committed top-up to fail, restart the payer
  manager, and prove it resumes the topped-up channel without opening or
  funding it twice. This directly covers the 0.8.14 recovery fix.

### Settlement and durable recovery

- Cross the configured settlement threshold and assert a real on-chain settle
  transaction.
- Reconcile the latest voucher, precompile state, payer/payee balances, Lucid
  channel store, and payment accounting.
- Restart Lucid with the SQLite store while retaining chain state, then
  continue the same channel.
- Run the same protocol against Postgres in its database-enabled CI lane.
- For Postgres, exercise two Lucid instances or store pools concurrently so the
  test proves cross-process linearizability rather than merely a restart.
- Kill or fail the service at the key boundaries: after voucher persistence,
  after settlement broadcast, and after receipt before accounting
  finalization. Each restart must converge without service-before-persistence,
  lost spend, or duplicate settlement.

### Adversarial and terminal behavior

- Replay, stale, equal, or decreasing vouchers.
- Bad signer, wrong channel, wrong descriptor, and wrong challenge binding.
- Concurrent duplicate requests at a nearly exhausted deposit ceiling.
- Settlement receipt ambiguity and idempotent recovery.
- Cooperative close with `ChannelClosed`, final payee settlement, payer refund,
  terminal store state, and idempotent repeated close/retry behavior.

TIP-1034 also defines `requestClose` followed by a 15-minute withdrawal grace
period. Lucid should not make a PR job wait 15 minutes, nor invent unsupported
time-travel behavior. The Tempo implementation and upstream precompile tests
own the grace-period primitive. Lucid's required lane should prove cooperative
close and its own terminal reconciliation. Add the forced-close path only if
the pinned official node exposes a documented deterministic time-control
mechanism; otherwise cover it in an upstream conformance reference or a
scheduled, bounded test rather than sleeping.

The upstream SDK already proves that the intended primitive is testable against
a real node. Its
[chain integration tests](https://github.com/wevm/mppx/blob/mppx%400.8.14/src/tempo/session/precompile/Chain.integration.test.ts)
cover open, read, top-up, settle, sponsored operations, and close, while the
[server session integration tests](https://github.com/wevm/mppx/blob/mppx%400.8.14/src/tempo/session/server/Session.integration.test.ts)
cover credential verification and channel-store effects. Lucid tests should
reuse public SDK APIs, not copy those internal implementations.

## CI design

Add a dedicated `tempo_e2e` job instead of hiding chain setup inside unit
coverage.

### Required pull-request job

- Runner: `ubuntu-latest`, with Docker available.
- Timeout: bounded independently from the general test suite.
- Image: exact verified multi-arch OCI index digest.
- Process topology: one Tempo container, one serial focused E2E test process.
- Readiness: poll `eth_chainId`, assert `0x539`, then perform one warm-up/funding
  transaction.
- Test isolation: fresh container per job, unique channel salts, known local
  accounts, no persisted volume, and no test-order dependence beyond an
  explicit lifecycle scenario.
- Cleanup: unconditional container removal and temporary-file cleanup.
- Gate: add the job to `required_verification`.

One node should serve the focused charge and session files sequentially.
Starting one node per test or per shard adds latency and race surfaces without
increasing correctness. Conversely, reusing a snapshot or persistent chain
between CI jobs makes failure reproduction and nonce state less deterministic.

Cache the image by digest only if measurements show pull time is material.
Correctness must not depend on the cache. A deliberate maintenance job may
report a newer stable Tempo release, but it must not silently change the
required digest.

The image is multi-architecture, so local Apple Silicon and CI x64 use the same
logical pin. Required PR coverage needs x64 execution. If an ARM64 GitHub
runner is available, add a small scheduled image-start/readiness smoke rather
than duplicating the entire payment matrix on every PR.

### Diagnostics and secret safety

The required local lane needs no secret. Its mnemonic is intentionally public
and must be accepted only behind the loopback plus chain-ID fence.

For any generated or external credential:

- pass secrets through environment/stdin rather than command-line arguments;
- mask a generated private key before any command can print it;
- also mask encoded or transformed representations;
- never log `Authorization: Payment`, credentials, raw signed transactions,
  signatures, HMAC secrets, full request headers, or store encryption secrets;
- sanitize HTTP errors and SDK debug output before artifact upload.

Safe evidence includes package versions, image digest, chain ID, public test
addresses, challenge/channel IDs, transaction hashes, block numbers, amounts,
receipt status, event names, store backend, and assertion results. Upload
sanitized app/test evidence always, and sanitized node logs only on failure.
GitHub's primary guidance is to use the secrets context, mask non-secret
sensitive values, and audit generated logs; see
[Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
and
[Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).

## Moderato: a canary, not the correctness gate

Moderato catches a different class of defects: public RPC behavior, deployed
hardfork configuration, faucet availability, propagation/finality, and
differences between the pinned local node and the live testnet. Those external
dependencies make it unsuitable as the initial required PR gate.

Start with a manual workflow, then a scheduled non-blocking canary:

- generate ephemeral payer/payee keys at runtime where the faucet permits it;
- mask keys before any possible output;
- assert the Moderato chain ID before funding or signing;
- cap deposit, fee, and total run spend;
- serialize runs with a workflow concurrency group;
- use cooperative close and verify refund/terminal state in `finally`;
- retain transaction and channel references for recovery;
- classify faucet/RPC/network outages separately from Lucid failures;
- never run untrusted pull-request code with a funded long-lived wallet or
  secret.

If a hosted Tempo relay is tested, put it here. `mppx@0.8.14` adds charge
validation/broadcast and relay support, but an API key and public service would
make the required local lane less deterministic without improving its
precompile coverage. The
[official charge-relay example](https://github.com/wevm/mppx/tree/mppx%400.8.14/examples/charge-relay)
is appropriate for a provider-contract canary, not the primary chain test.

Do not promote Moderato to a required check merely because several runs pass.
Define an explicit reliability threshold first—for example, 30 consecutive
scheduled successes across at least 30 days plus an agreed faucet/RPC service
expectation. Even then, keeping it advisory may be the correct choice because
the local lane already owns deterministic product correctness.

## Implementation sequence

### Phase 0 — prove the cohort

1. Add a disposable local spike that starts the candidate Tempo image by its
   full OCI index digest and records its source-revision label.
2. Verify its signature, platform manifests, chain ID, faucet, and `pathUSD`.
3. Test exact `mppx@0.8.14` plus Viem `2.55.8`.
4. Complete one real native charge and one unsponsored session open/top-up.
5. Run every existing MPP and repository test.
6. Only then update the catalog, lockfile, package/support documentation, and
   changeset together.

Exit criterion: one recorded, reproducible cohort with no preview packages,
mutable tags, dependency overrides, or local SDK patches.

### Phase 1 — build the narrow node fixture

Add start/readiness/fund/stop orchestration, loopback and chain-ID guards,
bounded polling, deterministic accounts, unique scenario salts, and the
redacted evidence schema. Keep this in test/support code; do not add a general
Tempo-node abstraction to a runtime package.

Exit criterion: a local developer and CI can run the same fixture on ARM64 and
AMD64, interrupt it, rerun it, and get a clean chain.

### Phase 2 — charge E2E

Implement the happy HTTP flow first, then balance/receipt reconciliation,
binding failures, replay/concurrency, and handler-after-payment ambiguity.

Exit criterion: the test fails if the chain transaction, mppx credential,
Lucid handler, receipt, or accounting layer is bypassed.

### Phase 3 — session E2E

Implement open/invoke, cumulative vouchers, SSE, top-up/recovery,
threshold settlement, SQLite restart, concurrent Postgres, and cooperative
close. Add adversarial and crash-boundary scenarios one at a time under TDD.

Exit criterion: the suite reconciles on-chain state, durable store state,
HTTP/SSE behavior, and Lucid accounting throughout one complete channel
lifecycle.

### Phase 4 — make local Tempo required

Add the dedicated job, pinned image, artifact redaction, cleanup, timeout, and
`required_verification` dependency. Document the exact local command and the
version-update procedure.

Exit criterion: a pull request cannot merge when either native Tempo charge or
session E2E fails, while public-cloud outages cannot block it.

### Phase 5 — add the Moderato canary

Start manual, add scheduled execution after the recovery and spend controls are
proven, and keep it non-blocking until a separately agreed reliability policy
is met.

## What not to build

- No Lucid implementation of TIP-1034 bytecode or reserve accounting.
- No validator/consensus network.
- No custom genesis generator.
- No ordinary-Anvil simulation as the authoritative Tempo test.
- No mocked JSON-RPC labelled as E2E.
- No public RPC or faucet in the required PR gate.
- No long-lived funded wallet in untrusted pull-request workflows.
- No workaround that keeps `mppx@0.8.13` session management transactions.
- No hard-coded gas or regular nonce intended to bypass upstream transaction
  preparation.
- No 15-minute sleep for the withdrawal grace period.
- No duplicated protocol-internal test suite; assert Lucid integration through
  public SDK and HTTP surfaces.

## Risks and controls

| Risk                                 | Control                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Mutable node behavior                | Exact reviewed OCI index digest, source-revision attestation, signature verification, deliberate cohort updates |
| SDK/node mismatch                    | Pin node, `mppx`, and Viem as one tested support cohort                                                         |
| Test mnemonic reaches a public chain | Require loopback RPC and chain ID `1337` before signing                                                         |
| Nonce or timing flake                | `mppx@0.8.14` expiring nonces, fresh node, unique salts, receipt/event polling                                  |
| Gas mismatch                         | Use Tempo/Viem estimation and fee-token funding; no Anvil estimates or hard-coded gas                           |
| Cross-test contamination             | Fresh node per CI job and serial lifecycle scenarios                                                            |
| Slow CI                              | One shared node per job, focused files, 200 ms blocks, measure before caching                                   |
| Architecture drift                   | Multi-arch index pin; optional scheduled ARM64 readiness smoke                                                  |
| Sensitive artifacts                  | Allowlisted evidence, header/transaction redaction, generated-value masking                                     |
| Public testnet outage                | Moderato remains separately classified and non-blocking                                                         |
| False confidence from happy path     | Required adversarial, concurrency, crash, restart, and reconciliation cases                                     |

## Primary-source index

- [TIP-1034: TIP-20 Channel Reserve Precompile](https://github.com/tempoxyz/tempo/blob/v1.11.0/tips/tip-1034.md)
- [TIP-1009: Expiring Transactions](https://github.com/tempoxyz/tempo/blob/v1.11.0/tips/tip-1009.md)
- [Tempo session protocol draft](https://paymentauth.org/draft-tempo-session-00.html)
- [Tempo transaction specification](https://tempo.xyz/developers/docs/protocol/transactions/spec-tempo-transaction)
- [Tempo fees](https://tempo.xyz/developers/docs/protocol/fees)
- [Tempo node image installation and verification](https://tempo.xyz/developers/docs/guide/node/installation)
- [Tempo Foundry guide](https://tempo.xyz/developers/docs/sdk/foundry)
- [Tempo v1.11.0 release](https://github.com/tempoxyz/tempo/releases/tag/v1.11.0)
- [`mppx@0.8.14` required verification workflow](https://github.com/wevm/mppx/blob/mppx%400.8.14/.github/workflows/verify.yml#L74-L190)
- [`mppx@0.8.14` release](https://github.com/wevm/mppx/releases/tag/mppx%400.8.14)
- [`mppx` expiring-nonce fix](https://github.com/wevm/mppx/commit/a3a0d82623db2630ecec890d67ea1e4fa5eeed01)
- [`mppx` precompile integration test](https://github.com/wevm/mppx/blob/mppx%400.8.14/src/tempo/session/precompile/Chain.integration.test.ts)
- [`mppx` session-server integration test](https://github.com/wevm/mppx/blob/mppx%400.8.14/src/tempo/session/server/Session.integration.test.ts)
- [Viem PR 4880: preserve relay fee-payer signatures](https://github.com/wevm/viem/pull/4880)
- [Viem 2.55.7 release](https://github.com/wevm/viem/releases/tag/viem%402.55.7)
- [Viem 2.55.8 release](https://github.com/wevm/viem/releases/tag/viem%402.55.8)

## Implementation result

The research recommendation is now implemented. The workspace executes the
reviewed Tempo image by immutable OCI digest, verifies its source-revision
label and chain ID, funds deterministic local accounts, and runs the exact
`mppx@0.8.14`/Viem `2.55.8` cohort through public buyer, Lucid HTTP, durable
session storage, and native Tempo precompile surfaces. The same explicit test
command is a required CI dependency; it has no public-RPC or cloud-faucet
dependency.
