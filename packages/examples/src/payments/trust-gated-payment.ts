import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { wallets } from '@lucid-agents/wallet';

/**
 * Trust-gated payment example.
 *
 * Demonstrates how a paying agent screens a counterparty's recipient address
 * for *risk* BEFORE sending an x402 payment to it. This is a complementary
 * safety primitive to `@lucid-agents/identity`'s ERC-8004 identity + reputation:
 * identity answers "who is this agent and what is their on-chain reputation?"
 * (identity NFT, peer feedback), whereas this screen answers a different
 * question — "is the wallet I'm about to pay sanctioned / risky?" The two
 * compose; neither replaces the other.
 *
 * Risk scope here is the free OFAC sanctions wallet-screen leg. A paid,
 * multi-source trust-check endpoint exists (referenced in the free response
 * metadata) but is intentionally out of scope for this example.
 *
 * The spine of this example is the vendor-neutral `CounterpartyScreener`
 * interface, NOT any single provider. `PaladinScreener` is one implementation
 * (selected via the `SCREENER_URL` env var); `LocalDenylistScreener` is a
 * second, fully offline implementation. Swap in your own by implementing the
 * same interface.
 *
 * Run from repo root (runs the full screen→pay gate offline with a stubbed
 * payment leg — no funded wallet, no real network payment — and prints the
 * GatedPaymentResult):
 *   bun run packages/examples/src/payments/trust-gated-payment.ts
 *
 * Run a one-shot live screen of an address (free OFAC leg only):
 *   bun run packages/examples/src/payments/trust-gated-payment.ts --screen 0x0000000000000000000000000000000000000000
 *
 * Environment variables:
 *   SCREENER_URL   - Screener endpoint (default: PaladinFi free OFAC wallet screen)
 *   FAIL_OPEN      - "true" to proceed on screener failure (default: false = fail-closed)
 *   PORT           - Server port (default: 3000)
 */

// ─── Vendor-Neutral Screening Seam ───────────────────────────────

/**
 * Result of screening a counterparty recipient address.
 *
 * - `allow`       — recipient is not flagged; the payment may proceed.
 * - `block`       — recipient is flagged (e.g. OFAC-sanctioned); ALWAYS abort.
 * - `unavailable` — the screener could not produce a verdict (network error,
 *                   timeout, rate-limit, geo-block, malformed response, etc.).
 *                   Under the default fail-closed policy the caller MUST abort.
 */
export interface ScreenResult {
  decision: 'allow' | 'block' | 'unavailable';
  reason?: string;
}

/**
 * Vendor-neutral counterparty risk screener.
 *
 * Implement this interface to plug any risk-screening provider into the
 * trust-gated payment flow. The payment flow depends only on this contract,
 * never on a concrete vendor.
 */
export interface CounterpartyScreener {
  /**
   * Screen a recipient wallet address for risk.
   *
   * Implementations MUST NOT throw for operational failures; instead they
   * return `{ decision: "unavailable" }` so the caller can apply a single,
   * explicit fail-open/fail-closed policy. Implementations MAY throw only for
   * programmer errors (e.g. a malformed address that should have been
   * validated upstream).
   *
   * @param address - 0x-prefixed 40-hex EVM address of the recipient.
   * @returns the screening verdict.
   */
  screenRecipient(address: string): Promise<ScreenResult>;
}

// ─── Address Validation ──────────────────────────────────────────

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Returns true if `address` is a 0x-prefixed 40-hex EVM address.
 *
 * @param address - candidate string.
 */
export function isValidEvmAddress(address: string): boolean {
  return EVM_ADDRESS_RE.test(address);
}

// ─── PaladinFi Screener Implementation ───────────────────────────

/** PaladinFi free, anonymous, read-only OFAC wallet-screen endpoint. */
const DEFAULT_SCREENER_URL = 'https://trust.paladinfi.com/v1/trust-check/ofac';

/**
 * Shape of the PaladinFi `/v1/trust-check/ofac` response that we read.
 *
 * The decision lives at `trust.recommendation` (the response nests it; it is
 * NOT a top-level field). `trust.factors[].signal` carries the per-source
 * detail we surface in `reason`. Other fields on the live response (signing
 * envelope, paid-endpoint metadata, staleness counters) are intentionally not
 * depended on here.
 */
interface PaladinOfacResponse {
  trust?: {
    recommendation?: string;
    factors?: Array<{
      source?: string;
      signal?: string;
      details?: string;
      real?: boolean;
    }>;
  };
}

/**
 * Options for {@link PaladinScreener}.
 */
export interface PaladinScreenerOptions {
  /** Endpoint URL. Defaults to the free OFAC wallet screen. */
  url?: string;
  /** Per-request timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
  /** Fetch implementation (injectable for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * `CounterpartyScreener` backed by PaladinFi's free OFAC wallet-screen endpoint.
 *
 * Network/HTTP/parse failures are converted to `{ decision: "unavailable" }`
 * rather than thrown, so the payment flow can apply one explicit fail-closed
 * policy.
 */
export class PaladinScreener implements CounterpartyScreener {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PaladinScreenerOptions = {}) {
    this.url = options.url ?? DEFAULT_SCREENER_URL;
    // Guard against a non-positive timeout (misconfig / 0) silently aborting
    // every request immediately — fall back to the 5000ms default.
    this.timeoutMs =
      options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 5000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async screenRecipient(address: string): Promise<ScreenResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
        signal: controller.signal,
      });

      // Any non-2xx (429 rate-limit, 451 EEA geo-block, 5xx, etc.) is treated
      // as "could not verify" — never as an implicit allow.
      if (!res.ok) {
        // Release the unread body so the connection isn't leaked.
        res.body?.cancel?.();
        return {
          decision: 'unavailable',
          reason: `screener HTTP ${res.status}`,
        };
      }

      let body: PaladinOfacResponse;
      try {
        body = (await res.json()) as PaladinOfacResponse;
      } catch {
        return { decision: 'unavailable', reason: 'malformed screener JSON' };
      }

      const recommendation = body.trust?.recommendation;
      const ofacFactor = body.trust?.factors?.find(f => f.source === 'ofac');
      const signal = ofacFactor?.signal;

      // Explicit OFAC listing always blocks.
      if (signal === 'listed') {
        return { decision: 'block', reason: 'ofac:listed' };
      }
      // Explicit composite block (e.g. honeypot/rug from the full endpoint)
      // also blocks.
      if (recommendation === 'block') {
        return { decision: 'block', reason: 'recommendation:block' };
      }
      // Allow ONLY on an affirmative, real OFAC not-listed factor — never trust
      // a bare composite recommendation when the OFAC factor is missing or not
      // real.
      if (signal === 'not_listed' && ofacFactor?.real === true) {
        return { decision: 'allow', reason: 'ofac:not_listed' };
      }
      // warn / missing factors / real:false / unknown => could not verify
      // (fail-closed).
      return {
        decision: 'unavailable',
        reason: `no affirmative ofac verdict (rec=${recommendation ?? 'unknown'}, signal=${signal ?? 'none'})`,
      };
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      // AbortError (timeout) and network errors land here.
      return { decision: 'unavailable', reason: `screen failed: ${name}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─── Local Denylist Screener Implementation ──────────────────────

/**
 * Offline `CounterpartyScreener` backed by an in-memory denylist.
 *
 * Proves the `CounterpartyScreener` seam is vendor-neutral — a static local
 * allow/deny list (the same shape several wallets ship) is a perfectly valid
 * alternative to a remote API. Returns `block` for any address in the set,
 * otherwise `allow`. Never throws and never touches the network.
 */
export class LocalDenylistScreener implements CounterpartyScreener {
  private readonly denied: Set<string>;

  /** @param denied - addresses to block (case-insensitive). */
  constructor(denied: Iterable<string> = []) {
    this.denied = new Set([...denied].map(a => a.toLowerCase()));
  }

  async screenRecipient(address: string): Promise<ScreenResult> {
    return this.denied.has(address.toLowerCase())
      ? { decision: 'block', reason: 'local:denylist' }
      : { decision: 'allow', reason: 'local:not-denied' };
  }
}

// ─── Trust-Gated Payment ─────────────────────────────────────────

/** A `fetch`-compatible function that attaches x402 payment. */
type FetchWithPayment = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Outcome of an attempted trust-gated payment.
 */
export interface GatedPaymentResult {
  paid: boolean;
  /** Why the payment did or did not proceed. */
  status:
    | 'paid'
    | 'aborted:invalid-address'
    | 'aborted:blocked'
    | 'aborted:unavailable'
    | 'proceeded:fail-open'
    | 'error:payment';
  screen: ScreenResult | null;
  /** Present only when `paid` is true. */
  response?: Response;
}

/**
 * Options controlling the gate's failure behaviour.
 */
export interface TrustGateOptions {
  /**
   * When the screener returns `unavailable`, proceed with payment anyway.
   * Default false (fail-closed) — the safe default for an OFAC gate. Set to
   * true ONLY with a deliberate, logged risk acceptance.
   */
  failOpen?: boolean;
  /** Optional logger (defaults to console). */
  logger?: Pick<typeof console, 'warn' | 'info' | 'error'>;
}

/**
 * Screen a recipient, then send an x402 payment to it only if the screen allows.
 *
 * Fail-CLOSED by default: a `block` verdict always aborts, and on `unavailable`
 * the payment aborts with a loud log unless `failOpen` is explicitly set. The
 * fail-open-vs-fail-closed choice is always logged.
 *
 * @param args.screener        - the counterparty screener implementation.
 * @param args.recipient       - recipient EVM address (validated here).
 * @param args.url             - the paid endpoint to call once the screen allows.
 * @param args.fetchWithPayment - x402-wrapped fetch from `createRuntimePaymentContext`.
 * @param args.requestInit     - request init forwarded to the paid call.
 * @param args.options         - gate failure policy + logger.
 */
export async function payIfRecipientAllowed(args: {
  screener: CounterpartyScreener;
  recipient: string;
  url: string;
  fetchWithPayment: FetchWithPayment;
  requestInit?: RequestInit;
  options?: TrustGateOptions;
}): Promise<GatedPaymentResult> {
  const logger = args.options?.logger ?? console;
  const failOpen = args.options?.failOpen ?? false;

  // 4. Input validation — reject before any network call.
  if (!isValidEvmAddress(args.recipient)) {
    logger.error(
      `SCREEN_INVALID_ADDRESS: aborting payment, recipient "${args.recipient}" is not a valid EVM address`
    );
    return {
      paid: false,
      status: 'aborted:invalid-address',
      screen: null,
    };
  }

  const screen = await args.screener.screenRecipient(args.recipient);

  // 3a. A block decision ALWAYS aborts — never a no-op.
  if (screen.decision === 'block') {
    logger.warn(
      `SCREEN_BLOCK: aborting payment, recipient ${args.recipient} is flagged (${screen.reason ?? 'blocked'})`
    );
    return { paid: false, status: 'aborted:blocked', screen };
  }

  // 3b. Screener could not verify the recipient. Apply the explicit, logged
  // fail-open/fail-closed policy. NEVER silently proceed on an OFAC gate.
  if (screen.decision === 'unavailable') {
    if (!failOpen) {
      logger.warn(
        `SCREEN_UNAVAILABLE: aborting payment, screener could not verify recipient ${args.recipient} (${screen.reason ?? 'unavailable'}); policy=fail-closed`
      );
      return { paid: false, status: 'aborted:unavailable', screen };
    }
    logger.warn(
      `SCREEN_UNAVAILABLE: proceeding WITHOUT a verdict for ${args.recipient} (${screen.reason ?? 'unavailable'}); policy=fail-open (risk accepted)`
    );
    const response = await args.fetchWithPayment(args.url, args.requestInit);
    return { paid: true, status: 'proceeded:fail-open', screen, response };
  }

  // 3c. Allowed — proceed with the x402 payment.
  logger.info(
    `SCREEN_ALLOW: recipient ${args.recipient} cleared (${screen.reason ?? 'allow'}); sending payment`
  );
  try {
    const response = await args.fetchWithPayment(args.url, args.requestInit);
    return { paid: true, status: 'paid', screen, response };
  } catch (err) {
    logger.error(
      `PAYMENT_ERROR: screen allowed but payment failed for ${args.recipient}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { paid: false, status: 'error:payment', screen };
  }
}

// ─── Demo Wiring (runnable) ──────────────────────────────────────
// Everything below only runs when this file is executed directly, so the
// exported interface + functions above stay importable by tests.

/** One-shot live screen against the free OFAC leg; prints the verdict. */
async function runOneShotScreen(address: string): Promise<void> {
  const screener = new PaladinScreener({ url: process.env.SCREENER_URL });
  if (!isValidEvmAddress(address)) {
    console.error(`Invalid address: ${address}`);
    process.exitCode = 1;
    return;
  }
  const result = await screener.screenRecipient(address);
  console.log(JSON.stringify({ address, ...result }, null, 2));
}

async function main(): Promise<void> {
  const screenFlagIdx = process.argv.indexOf('--screen');
  if (screenFlagIdx !== -1) {
    const addr = process.argv[screenFlagIdx + 1] ?? '';
    await runOneShotScreen(addr);
    return;
  }

  // Base Sepolia testnet (CAIP-2 eip155:84532) — matches every other example
  // in this repo. The screener and the payment network share the same chain so
  // the OFAC verdict applies to the wallet being paid.
  const network = 'eip155:84532';

  // The agent's own sample recipient — the address we will screen below.
  const sampleRecipient = '0x0000000000000000000000000000000000000001';

  const agent = await createAgent({
    name: 'trust-gated-payment',
    version: '1.0.0',
    description:
      'Consumer agent that screens a counterparty before paying it via x402',
  })
    .use(http())
    .use(
      payments({
        config: {
          payTo: sampleRecipient,
          network,
          facilitatorUrl:
            process.env.FACILITATOR_URL ??
            'https://facilitator.daydreams.systems',
        },
      })
    )
    .use(
      wallets({
        config: {
          agent: {
            type: 'local',
            // Example key (Hardhat account #0) — replace for real payments.
            privateKey:
              '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
          },
        },
      })
    )
    .build();

  const { app } = await createAgentApp(agent);

  const screener = new PaladinScreener({ url: process.env.SCREENER_URL });
  const failOpen = process.env.FAIL_OPEN === 'true';

  // A second, fully-offline screener — proves the seam is not PaladinFi-only.
  // (A static local denylist is a real alternative, cf. wallets that ship
  // built-in address lists.) Not used for the demo run below, but shown here
  // so a reader sees two interchangeable implementations.
  const localScreener = new LocalDenylistScreener([
    '0x000000000000000000000000000000000000dEaD',
  ]);
  void localScreener;

  // Exercise the full screen→pay gate END-TO-END, OFFLINE: no funded wallet and
  // no real network payment. `fetchWithPayment` is a local stub returning a
  // fixed 200, so the payment leg fires deterministically once the screen
  // clears. The screen itself uses the real PaladinScreener against the free
  // OFAC endpoint, which is fine for a runnable demo.
  const stubFetchWithPayment: FetchWithPayment = async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200 });

  const result = await payIfRecipientAllowed({
    screener,
    recipient: sampleRecipient,
    url: 'https://service.example/entrypoints/echo/invoke',
    fetchWithPayment: stubFetchWithPayment,
    requestInit: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { message: 'hi' } }),
    },
    options: { failOpen },
  });

  console.log(
    `Trust-gated payment agent ready. Screener=${process.env.SCREENER_URL ?? DEFAULT_SCREENER_URL}, policy=${failOpen ? 'fail-open' : 'fail-closed'}.`
  );
  console.log('Gate result (offline demo, stubbed payment leg):');
  console.log(
    JSON.stringify(
      {
        paid: result.paid,
        status: result.status,
        screen: result.screen,
      },
      null,
      2
    )
  );
  console.log(
    'Screen-then-pay flow is exposed via payIfRecipientAllowed(); see --screen for a live OFAC check.'
  );

  const port = Number(process.env.PORT ?? 3000);
  const server = Bun.serve({ port, fetch: app.fetch });
  console.log(
    `Listening at http://${server.hostname}:${server.port}/.well-known/agent-card.json`
  );
}

if (import.meta.main) {
  await main();
}
