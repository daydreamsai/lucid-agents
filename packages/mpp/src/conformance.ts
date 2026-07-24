import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
} from '@lucid-agents/types/core';
import type {
  MppCredentialVerifier,
  MppPaymentRequirement,
  MppRuntime,
  MppServerMethod,
} from '@lucid-agents/types/mpp';
import { Challenge, Credential } from 'mppx';

import type { MppWireChallenge } from './challenge';
import { mpp } from './extension';

const DEFAULT_CASE_TIMEOUT_MS = 5_000;
const MAX_CASE_TIMEOUT_MS = 60_000;
const INVALID_SCENARIOS: readonly CustomMppConformanceScenario[] = [
  'invalid-authenticity',
  'expired-credential',
  'wrong-amount',
  'wrong-currency',
  'wrong-recipient',
  'wrong-method',
  'wrong-intent',
  'wrong-challenge',
  'wrong-payer',
  'unsettled-payment',
];

/** Base class for failures raised by the public conformance runner itself. */
export class CustomMppConformanceError extends Error {
  override readonly name: string = 'CustomMppConformanceError';
}

/** Invalid conformance options that prevent a meaningful run. */
export class CustomMppConformanceConfigurationError extends CustomMppConformanceError {
  override readonly name = 'CustomMppConformanceConfigurationError';
}

/** Invalid or reused provider fixtures that cannot prove distinct cases. */
export class CustomMppConformanceFixtureError extends CustomMppConformanceError {
  override readonly name = 'CustomMppConformanceFixtureError';
}

/** Provider HTTP adapter failure outside the behavior under test. */
export class CustomMppConformanceAdapterError extends CustomMppConformanceError {
  override readonly name = 'CustomMppConformanceAdapterError';
}

/** A bounded conformance operation exceeded its configured deadline. */
export class CustomMppConformanceTimeoutError extends CustomMppConformanceError {
  override readonly name = 'CustomMppConformanceTimeoutError';

  /** Stable identifier of the check that exceeded its deadline. */
  readonly checkId: string;

  constructor(checkId: string) {
    super(`Custom MPP conformance check "${checkId}" timed out`);
    this.checkId = checkId;
  }
}

/** Provider-controlled credential cases required by the custom verifier suite. */
export type CustomMppConformanceScenario =
  | 'valid'
  | 'invalid-authenticity'
  | 'expired-credential'
  | 'wrong-amount'
  | 'wrong-currency'
  | 'wrong-recipient'
  | 'wrong-method'
  | 'wrong-intent'
  | 'wrong-challenge'
  | 'wrong-payer'
  | 'unsettled-payment';

/** Normalized semantic evidence independent of a provider credential schema. */
export type CustomMppConformanceEvidence = {
  /** Whether the provider proof is authentic. */
  authenticity: 'valid' | 'invalid';
  /** Whether the proof binds the challenge issued for this case. */
  challenge: 'issued' | 'other';
  /** Whether the proof carries the required amount. */
  amount: 'required' | 'other';
  /** Whether the proof carries the required currency. */
  currency: 'required' | 'other';
  /** Whether the proof carries the configured recipient. */
  recipient: 'required' | 'other';
  /** Whether the proof selects the challenged method. */
  method: 'required' | 'other';
  /** Whether the proof selects the challenged intent. */
  intent: 'required' | 'other';
  /** Whether the proof carries the expected payer. */
  payer: 'expected' | 'other';
  /** Whether the provider validity window is current. */
  validity: 'current' | 'expired';
  /** Whether provider settlement completed. */
  settlement: 'settled' | 'unsettled';
};

/** Provider credential fixture submitted to the runtime under test. */
export type CustomMppConformanceCredential = {
  /** Provider-specific credential payload serialized by MPP. */
  payload: Record<string, unknown>;
  /** Optional cryptographically asserted payer DID. */
  source?: string;
};

/** Exact test case context supplied to fixture builders and inspectors. */
export type CustomMppConformanceFixtureContext = {
  /** Trust-boundary behavior this fixture must exercise. */
  scenario: CustomMppConformanceScenario;
  /** Exact challenge issued by the conformance runtime. */
  challenge: MppWireChallenge;
  /** Exact payment terms selected for this scenario. */
  requirement: Extract<MppPaymentRequirement, { required: true }>;
  /** Protected operation being exercised. */
  kind: 'invoke' | 'stream';
};

/** Scenario-blind context supplied to the trusted credential inspector. */
export type CustomMppConformanceInspectionContext = Omit<
  CustomMppConformanceFixtureContext,
  'scenario'
>;

/** Builds an independent credential fixture for one conformance scenario. */
export type CustomMppConformanceCredentialFactory = (
  context: CustomMppConformanceFixtureContext
) => CustomMppConformanceCredential | Promise<CustomMppConformanceCredential>;

/**
 * Trusted test-code adapter that projects an actual provider payload into the
 * normalized conformance vocabulary.
 */
export type CustomMppConformanceCredentialInspector = (
  credential: Readonly<CustomMppConformanceCredential>,
  context: CustomMppConformanceInspectionContext
) => CustomMppConformanceEvidence | Promise<CustomMppConformanceEvidence>;

/** One stable, redaction-safe conformance observation. */
export type CustomMppConformanceCheck = {
  /** Stable behavioral check identifier. */
  id: string;
  /** Whether the observed public behavior conformed. */
  passed: boolean;
  /** A stable diagnostic that never includes credentials or provider errors. */
  detail?: string;
};

/** Complete reusable verifier conformance result. */
export type CustomMppConformanceReport = {
  /** True only when every check passed. */
  passed: boolean;
  /** Ordered public behavior checks. */
  checks: CustomMppConformanceCheck[];
};

/** Inputs for the runner-agnostic custom verifier conformance suite. */
export type CustomMppVerifierConformanceOptions = {
  /** A custom (or Lightning descriptor) method configured through mpp(). */
  method: MppServerMethod;
  /** Display amount used for protected invoke and streaming checks. */
  amount: string;
  /** Currency used for protected invoke and streaming checks. */
  currency: string;
  /** Provider verifier supplied through the public MPP extension contract. */
  verifier: MppCredentialVerifier;
  /** Independent fixture factory for every required trust-boundary scenario. */
  credentialFor: CustomMppConformanceCredentialFactory;
  /**
   * Trusted test-only parser that derives semantic evidence from the actual
   * payload. It must not infer evidence from `context.scenario`.
   */
  inspectCredential: CustomMppConformanceCredentialInspector;
  /** Expected safe metadata returned after successful verification. */
  expected: {
    /** Exact receipt or a safe predicate for provider-generated references. */
    receipt: string | ((receipt: string) => boolean);
    /** Exact payer metadata when the provider returns one. */
    payer?: string;
    /** Exact network metadata when the provider returns one. */
    network?: string;
  };
  /** Per-case deadline. Defaults to 5 seconds. */
  caseTimeoutMs?: number;
};

/** Protected HTTP lifecycle exercised by the reusable transport suite. */
export type CustomMppHttpConformanceScenario =
  | 'success'
  | 'credential-failure'
  | 'handler-failure'
  | 'settlement-failure'
  | 'verifier-timeout';

/** Credential variants generated by a provider's HTTP test adapter. */
export type CustomMppHttpCredentialScenario =
  | 'valid'
  | 'invalid-authenticity'
  | 'expired-credential'
  | 'wrong-context';

/** Normalized externally observable counters for one isolated HTTP service. */
export type CustomMppHttpConformanceMetrics = {
  /** Successful or failed invoke handler entries. */
  handlerCalls: number;
  /** Successful or failed streaming handler entries. */
  streamCalls: number;
  /** Provider settlement attempts, including ambiguous failures. */
  settlementCalls: number;
  /** Committed incoming accounting records. */
  accountingCount: number;
  /** Atomic total of committed incoming accounting records. */
  accountingTotal: string;
  /** Number of live or staged policy reservations. */
  reservationCount: number;
  /** Atomic total held by live or staged policy reservations. */
  reservationTotal: string;
};

/** Provider adapter for one isolated protected HTTP service scenario. */
export type CustomMppHttpConformanceService = {
  /** Send the provider-defined protected request over its public HTTP seam. */
  request(
    operation: 'invoke' | 'stream',
    authorization?: string
  ): Promise<Response>;
  /** Build a valid provider credential for the exact HTTP challenge. */
  createCredential(
    challenge: MppWireChallenge,
    operation: 'invoke' | 'stream',
    scenario: CustomMppHttpCredentialScenario
  ): string | Promise<string>;
  /** Read normalized handler, settlement, and accounting observations. */
  metrics():
    | CustomMppHttpConformanceMetrics
    | Promise<CustomMppHttpConformanceMetrics>;
  /** Release server, database, or provider sandbox resources. */
  close?(): void | Promise<void>;
};

/** Inputs for reusable public HTTP receipt, handler, and accounting checks. */
export type CustomMppHttpConformanceOptions = {
  /** Create an isolated service configured for the requested lifecycle. */
  serviceFor(
    scenario: CustomMppHttpConformanceScenario
  ): CustomMppHttpConformanceService | Promise<CustomMppHttpConformanceService>;
  /** Expected receipt and successful accounting observations. */
  expected: {
    /** Exact receipt or safe predicate for provider-generated references. */
    receipt: string | ((receipt: string) => boolean);
    /** Number of accounting records after invoke plus stream success. */
    successfulAccountingCount: number;
    /** Atomic accounting total after invoke plus stream success. */
    successfulAccountingTotal: string;
  };
  /** Non-empty secret markers forbidden in every failure body and header. */
  forbiddenResponseFragments: readonly [string, ...string[]];
  /** Per HTTP adapter operation deadline. Defaults to 5 seconds. */
  caseTimeoutMs?: number;
};

type FixtureRegistry = {
  invalidFingerprints: Map<string, CustomMppConformanceScenario>;
};

const VALID_EVIDENCE: CustomMppConformanceEvidence = {
  authenticity: 'valid',
  challenge: 'issued',
  amount: 'required',
  currency: 'required',
  recipient: 'required',
  method: 'required',
  intent: 'required',
  payer: 'expected',
  validity: 'current',
  settlement: 'settled',
};

function expectedEvidence(
  scenario: CustomMppConformanceScenario
): CustomMppConformanceEvidence {
  const evidence = { ...VALID_EVIDENCE };
  if (scenario === 'invalid-authenticity') evidence.authenticity = 'invalid';
  if (scenario === 'expired-credential') evidence.validity = 'expired';
  if (scenario === 'wrong-amount') evidence.amount = 'other';
  if (scenario === 'wrong-currency') evidence.currency = 'other';
  if (scenario === 'wrong-recipient') evidence.recipient = 'other';
  if (scenario === 'wrong-method') evidence.method = 'other';
  if (scenario === 'wrong-intent') evidence.intent = 'other';
  if (scenario === 'wrong-challenge') evidence.challenge = 'other';
  if (scenario === 'wrong-payer') evidence.payer = 'other';
  if (scenario === 'unsettled-payment') evidence.settlement = 'unsettled';
  return evidence;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)])
  );
}

function validateFixture(
  fixture: CustomMppConformanceCredential,
  evidence: CustomMppConformanceEvidence,
  scenario: CustomMppConformanceScenario,
  registry: FixtureRegistry
): void {
  const expected = expectedEvidence(scenario);
  if (
    JSON.stringify(stableValue(evidence)) !==
    JSON.stringify(stableValue(expected))
  ) {
    throw new CustomMppConformanceFixtureError(
      `Credential evidence does not describe scenario "${scenario}"`
    );
  }
  if (scenario === 'valid') return;
  const fingerprint = JSON.stringify(
    stableValue({ payload: fixture.payload, source: fixture.source ?? null })
  );
  const reusedBy = registry.invalidFingerprints.get(fingerprint);
  if (reusedBy) {
    throw new CustomMppConformanceFixtureError(
      `Credential fixture for "${scenario}" reuses "${reusedBy}"`
    );
  }
  registry.invalidFingerprints.set(fingerprint, scenario);
}

function caseTimeoutMs(options: { caseTimeoutMs?: number }): number {
  const timeoutMs = options.caseTimeoutMs ?? DEFAULT_CASE_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_CASE_TIMEOUT_MS
  ) {
    throw new CustomMppConformanceConfigurationError(
      `caseTimeoutMs must be an integer from 1 to ${MAX_CASE_TIMEOUT_MS}`
    );
  }
  return timeoutMs;
}

async function withinDeadline<Value>(
  checkId: string,
  timeoutMs: number,
  operation: () => Value | PromiseLike<Value>,
  onTimeout?: () => void
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new CustomMppConformanceTimeoutError(checkId));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fixtureOperation<Value>(
  checkId: string,
  timeoutMs: number,
  operation: () => Value | PromiseLike<Value>
): Promise<Value> {
  try {
    return await withinDeadline(checkId, timeoutMs, operation);
  } catch (error) {
    if (error instanceof CustomMppConformanceError) throw error;
    throw new CustomMppConformanceFixtureError(
      `Credential fixture operation "${checkId}" failed`
    );
  }
}

async function adapterOperation<Value>(
  checkId: string,
  timeoutMs: number,
  operation: () => Value | PromiseLike<Value>
): Promise<Value> {
  try {
    return await withinDeadline(checkId, timeoutMs, operation);
  } catch (error) {
    if (error instanceof CustomMppConformanceError) throw error;
    throw new CustomMppConformanceAdapterError(
      `HTTP conformance adapter operation "${checkId}" failed`
    );
  }
}

function conformanceEntrypoint(amount: string): EntrypointDef {
  return {
    key: 'custom-mpp-conformance',
    description: 'Custom MPP verifier conformance operation',
    paymentProtocol: 'mpp',
    price: { invoke: amount, stream: amount },
    stream: async () => ({ status: 'succeeded' }),
  };
}

function required(
  value: MppPaymentRequirement
): Extract<MppPaymentRequirement, { required: true }> {
  if (!value.required) {
    throw new CustomMppConformanceConfigurationError(
      'Custom MPP conformance operation did not require payment'
    );
  }
  return value;
}

type ConformanceHarness = {
  extension: ReturnType<typeof mpp>;
  agentRuntime: AgentRuntime;
  runtime: MppRuntime;
  entrypoint: EntrypointDef;
  requirement: Extract<MppPaymentRequirement, { required: true }>;
  kind: 'invoke' | 'stream';
  url: string;
  body: string;
};

async function createHarness(
  options: CustomMppVerifierConformanceOptions,
  verifier: MppCredentialVerifier,
  kind: 'invoke' | 'stream' = 'invoke'
): Promise<ConformanceHarness> {
  const timeoutMs = caseTimeoutMs(options);
  const extension = mpp({
    config: {
      methods: [options.method],
      currency: options.currency,
      verifyCredential: context => {
        const controller = new AbortController();
        const request = new Request(context.request, {
          signal: controller.signal,
        });
        return withinDeadline(
          `verifier-${kind}`,
          timeoutMs,
          () => verifier({ ...context, request }),
          () =>
            controller.abort(
              new CustomMppConformanceTimeoutError(`verifier-${kind}`)
            )
        );
      },
    },
  });
  const entrypoint = conformanceEntrypoint(options.amount);
  const agentRuntime = {} as AgentRuntime;
  let slice: Awaited<ReturnType<typeof extension.build>>;
  try {
    slice = await extension.build({
      meta: { name: 'custom-mpp-conformance', version: '1.0.0' },
      runtime: agentRuntime,
    } as BuildContext);
  } catch {
    throw new CustomMppConformanceConfigurationError(
      'Custom MPP conformance runtime could not be created'
    );
  }
  if (!slice.mpp) {
    throw new CustomMppConformanceConfigurationError(
      'Custom MPP conformance runtime was not created'
    );
  }
  slice.mpp.activate(entrypoint);
  const requirement = required(slice.mpp.requirements(entrypoint, kind));
  const url = `https://conformance.invalid/entrypoints/${entrypoint.key}/${kind}`;
  return {
    extension,
    agentRuntime,
    runtime: slice.mpp,
    entrypoint,
    requirement,
    kind,
    url,
    body: JSON.stringify({ input: { operation: kind } }),
  };
}

function requestFor(
  harness: ConformanceHarness,
  options?: {
    authorization?: string;
    body?: string;
    idempotencyKey?: string;
    url?: string;
  }
): Request {
  return new Request(options?.url ?? harness.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.authorization
        ? { Authorization: options.authorization }
        : {}),
      ...(options?.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : {}),
    },
    body: options?.body ?? harness.body,
  });
}

async function issueCredential(
  options: CustomMppVerifierConformanceOptions,
  harness: ConformanceHarness,
  registry: FixtureRegistry,
  scenario: CustomMppConformanceScenario = 'valid',
  requestOptions?: { body?: string; idempotencyKey?: string; url?: string }
): Promise<string> {
  const challenged = await harness.runtime.authorize(
    requestFor(harness, requestOptions),
    harness.entrypoint,
    harness.kind,
    harness.requirement
  );
  if (challenged.authorized || challenged.response.status !== 402) {
    throw new CustomMppConformanceFixtureError(
      'Custom MPP conformance challenge was not issued'
    );
  }
  let challenge: MppWireChallenge;
  try {
    challenge = Challenge.fromResponse(challenged.response) as MppWireChallenge;
  } catch {
    throw new CustomMppConformanceFixtureError(
      'Custom MPP conformance challenge could not be decoded'
    );
  }
  const fixture = await fixtureOperation(
    `fixture-${scenario}`,
    caseTimeoutMs(options),
    () =>
      options.credentialFor({
        scenario,
        challenge,
        requirement: harness.requirement,
        kind: harness.kind,
      })
  );
  const inspectionContext: CustomMppConformanceInspectionContext = {
    challenge,
    requirement: harness.requirement,
    kind: harness.kind,
  };
  const evidence = await fixtureOperation(
    `inspect-${scenario}`,
    caseTimeoutMs(options),
    () => options.inspectCredential(fixture, inspectionContext)
  );
  validateFixture(fixture, evidence, scenario, registry);
  try {
    return Credential.serialize({
      challenge,
      payload: fixture.payload,
      ...(fixture.source ? { source: fixture.source } : {}),
    });
  } catch {
    throw new CustomMppConformanceFixtureError(
      `Credential fixture for "${scenario}" could not be serialized`
    );
  }
}

async function runCredentialScenario(
  options: CustomMppVerifierConformanceOptions,
  registry: FixtureRegistry,
  scenario: CustomMppConformanceScenario,
  kind: 'invoke' | 'stream' = 'invoke'
) {
  const harness = await createHarness(options, options.verifier, kind);
  try {
    const authorization = await issueCredential(
      options,
      harness,
      registry,
      scenario
    );
    return await harness.runtime.authorize(
      requestFor(harness, { authorization }),
      harness.entrypoint,
      harness.kind,
      harness.requirement
    );
  } finally {
    await harness.extension.dispose?.(harness.agentRuntime);
  }
}

function safeCheck(
  id: string,
  passed: boolean,
  detail: string
): CustomMppConformanceCheck {
  return { id, passed, ...(passed ? {} : { detail }) };
}

function expectedReceiptMatches(
  expected: string | ((receipt: string) => boolean),
  actual: string | undefined
): boolean {
  if (actual === undefined) return false;
  if (typeof expected !== 'function') return actual === expected;
  try {
    return expected(actual) === true;
  } catch {
    return false;
  }
}

async function httpChallenge(
  service: CustomMppHttpConformanceService,
  operation: 'invoke' | 'stream',
  credentialScenario: CustomMppHttpCredentialScenario,
  timeoutMs: number,
  checkId: string
): Promise<{ challenge: MppWireChallenge; authorization: string }> {
  const response = await adapterOperation(checkId, timeoutMs, () =>
    service.request(operation)
  );
  if (response.status !== 402) {
    throw new CustomMppConformanceFixtureError(
      `HTTP adapter did not issue a 402 for "${checkId}"`
    );
  }
  let challenge: MppWireChallenge;
  try {
    challenge = Challenge.fromResponse(response) as MppWireChallenge;
  } catch {
    throw new CustomMppConformanceFixtureError(
      `HTTP adapter challenge for "${checkId}" could not be decoded`
    );
  }
  const authorization = await adapterOperation(
    `${checkId}-credential`,
    timeoutMs,
    () => service.createCredential(challenge, operation, credentialScenario)
  );
  return { challenge, authorization };
}

async function httpMetrics(
  service: CustomMppHttpConformanceService,
  timeoutMs: number,
  checkId: string
): Promise<CustomMppHttpConformanceMetrics> {
  return adapterOperation(checkId, timeoutMs, () => service.metrics());
}

async function closeHttpService(
  service: CustomMppHttpConformanceService,
  timeoutMs: number,
  checkId: string
): Promise<void> {
  if (!service.close) return;
  await adapterOperation(checkId, timeoutMs, () => service.close!());
}

async function protocolContractChecks(
  options: CustomMppVerifierConformanceOptions,
  registry: FixtureRegistry
): Promise<CustomMppConformanceCheck[]> {
  const checks: CustomMppConformanceCheck[] = [];

  {
    let verifierCalls = 0;
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      return options.verifier(context);
    });
    try {
      const missing = await harness.runtime.authorize(
        requestFor(harness),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          'missing-credential',
          !missing.authorized &&
            missing.response.status === 402 &&
            verifierCalls === 0,
          'Missing credentials must return a fresh 402 without calling the verifier.'
        )
      );
      const malformed = await harness.runtime.authorize(
        requestFor(harness, { authorization: 'Payment not-base64url' }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          'malformed-credential',
          !malformed.authorized &&
            malformed.response.status === 402 &&
            verifierCalls === 0,
          'Malformed credentials must return a fresh 402 without calling the verifier.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  {
    let verifierCalls = 0;
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      return options.verifier(context);
    });
    try {
      const authorization = await issueCredential(options, harness, registry);
      const wrongRoute = await harness.runtime.authorize(
        requestFor(harness, {
          authorization,
          url: `${harness.url}-other`,
        }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          'wrong-route-binding',
          !wrongRoute.authorized && verifierCalls === 0,
          'A credential used on another route must fail before verification.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  {
    let verifierCalls = 0;
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      return options.verifier(context);
    });
    try {
      const authorization = await issueCredential(options, harness, registry);
      const wrongBody = await harness.runtime.authorize(
        requestFor(harness, {
          authorization,
          body: JSON.stringify({ input: { operation: 'changed' } }),
        }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          'wrong-body-binding',
          !wrongBody.authorized && verifierCalls === 0,
          'A credential used with another request body must fail before verification.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  {
    let verifierCalls = 0;
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      return options.verifier(context);
    });
    try {
      const authorization = await issueCredential(options, harness, registry);
      const accepted = await harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      const replay = await harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          'single-use-replay',
          accepted.authorized && !replay.authorized && verifierCalls === 1,
          'A consumed credential must not verify or settle twice.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  {
    let verifierCalls = 0;
    let release: (() => void) | undefined;
    let markEntered: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const entered = new Promise<void>(resolve => {
      markEntered = resolve;
    });
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      markEntered?.();
      await gate;
      return options.verifier(context);
    });
    try {
      const authorization = await issueCredential(options, harness, registry);
      const first = harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      await entered;
      const duplicate = await harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      release?.();
      const accepted = await first;
      checks.push(
        safeCheck(
          'concurrent-duplicate',
          accepted.authorized &&
            !duplicate.authorized &&
            duplicate.response.status === 409 &&
            verifierCalls === 1,
          'Concurrent duplicate credentials must be fenced to one verifier call.'
        )
      );
    } finally {
      release?.();
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  {
    let verifierCalls = 0;
    const harness = await createHarness(options, async context => {
      verifierCalls += 1;
      return options.verifier(context);
    });
    try {
      const idempotencyKey = 'custom-mpp-conformance-recovery';
      const authorization = await issueCredential(
        options,
        harness,
        registry,
        'valid',
        {
          idempotencyKey,
        }
      );
      const first = await harness.runtime.authorize(
        requestFor(harness, { authorization, idempotencyKey }),
        harness.entrypoint,
        harness.kind,
        harness.requirement,
        { allowIdempotencyRecovery: true }
      );
      const recovered = await harness.runtime.authorize(
        requestFor(harness, { authorization, idempotencyKey }),
        harness.entrypoint,
        harness.kind,
        harness.requirement,
        { allowIdempotencyRecovery: true }
      );
      checks.push(
        safeCheck(
          'idempotent-recovery',
          first.authorized &&
            recovered.authorized &&
            first.receipt === recovered.receipt &&
            verifierCalls === 1,
          'A same-key retry must recover the receipt without verifying again.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  }

  const ambiguousFailureCheck = async (
    id: string,
    verifier: MppCredentialVerifier,
    timeoutMs?: number
  ): Promise<void> => {
    let verifierCalls = 0;
    const harness = await createHarness(
      timeoutMs === undefined
        ? options
        : { ...options, caseTimeoutMs: timeoutMs },
      async context => {
        verifierCalls += 1;
        return verifier(context);
      }
    );
    try {
      const authorization = await issueCredential(options, harness, registry);
      const failed = await harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      const body = failed.authorized ? '' : await failed.response.text();
      const replay = await harness.runtime.authorize(
        requestFor(harness, { authorization }),
        harness.entrypoint,
        harness.kind,
        harness.requirement
      );
      checks.push(
        safeCheck(
          id,
          !failed.authorized &&
            failed.response.status === 503 &&
            !body.includes('provider-secret') &&
            !replay.authorized &&
            verifierCalls === 1,
          'Ambiguous verifier failures must be redacted and consume the credential.'
        )
      );
    } finally {
      await harness.extension.dispose?.(harness.agentRuntime);
    }
  };

  await ambiguousFailureCheck('verifier-exception-redacted', async () => {
    throw new Error('provider-secret');
  });
  await ambiguousFailureCheck(
    'verifier-timeout-at-most-once',
    () => new Promise<never>(() => {}),
    Math.min(caseTimeoutMs(options), 50)
  );
  await ambiguousFailureCheck(
    'malformed-result',
    async () =>
      ({ valid: true }) as unknown as Awaited<ReturnType<MppCredentialVerifier>>
  );
  await ambiguousFailureCheck('invalid-receipt', async () => ({
    valid: true,
    receipt: 'bad\r\nprovider-secret',
  }));

  return checks;
}

/**
 * Exercise a provider verifier through Lucid's public custom MPP extension.
 *
 * The provider supplies independent credentials for every trust-boundary case.
 * The report contains only stable check identifiers and safe diagnostics, so it
 * can be consumed from Bun, Node, Vitest, Jest, or another test runner.
 */
export async function runCustomMppVerifierConformance(
  options: CustomMppVerifierConformanceOptions
): Promise<CustomMppConformanceReport> {
  if (
    options.method.implementation !== undefined &&
    options.method.implementation !== 'custom'
  ) {
    throw new CustomMppConformanceConfigurationError(
      'Custom MPP verifier conformance requires a custom or Lightning descriptor'
    );
  }
  caseTimeoutMs(options);
  const checks: CustomMppConformanceCheck[] = [];
  const registry: FixtureRegistry = { invalidFingerprints: new Map() };
  for (const kind of ['invoke', 'stream'] as const) {
    const valid = await runCredentialScenario(options, registry, 'valid', kind);
    const passed =
      valid.authorized &&
      expectedReceiptMatches(options.expected.receipt, valid.receipt) &&
      (options.expected.payer === undefined ||
        valid.payer === options.expected.payer) &&
      (options.expected.network === undefined ||
        valid.network === options.expected.network);
    checks.push({
      id: `valid-${kind}`,
      passed,
      ...(passed
        ? {}
        : {
            detail: valid.authorized
              ? 'Authorization metadata did not match the expected provider result.'
              : 'The provider rejected its valid credential fixture.',
          }),
    });
  }

  for (const scenario of INVALID_SCENARIOS) {
    const result = await runCredentialScenario(options, registry, scenario);
    const passed = !result.authorized && result.response.status === 402;
    checks.push({
      id: scenario,
      passed,
      ...(passed
        ? {}
        : {
            detail:
              'The verifier must reject an invalid credential with a protocol 402 response.',
          }),
    });
  }
  checks.push(...(await protocolContractChecks(options, registry)));

  return {
    passed: checks.every(check => check.passed),
    checks,
  };
}

/**
 * Exercise an arbitrary custom provider through protected public HTTP routes.
 *
 * The adapter creates isolated success, handler-failure, and
 * settlement-failure services. The runner observes only HTTP responses and the
 * adapter's normalized public counters; it does not depend on Lucid internals.
 */
export async function runCustomMppHttpConformance(
  options: CustomMppHttpConformanceOptions
): Promise<CustomMppConformanceReport> {
  const timeoutMs = caseTimeoutMs(options);
  if (
    options.forbiddenResponseFragments.length === 0 ||
    options.forbiddenResponseFragments.some(fragment => fragment.length === 0)
  ) {
    throw new CustomMppConformanceConfigurationError(
      'forbiddenResponseFragments must contain only non-empty secret markers'
    );
  }
  const checks: CustomMppConformanceCheck[] = [];
  const createService = (scenario: CustomMppHttpConformanceScenario) =>
    adapterOperation(`http-${scenario}-service`, timeoutMs, () =>
      options.serviceFor(scenario)
    );
  const responseIsRedacted = async (
    response: Response,
    checkId: string
  ): Promise<boolean> => {
    const body = await adapterOperation(checkId, timeoutMs, () =>
      response.clone().text()
    );
    const headers = [...response.headers.entries()]
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n');
    const publicResponse = `${headers}\n\n${body}`;
    return options.forbiddenResponseFragments.every(
      fragment => !publicResponse.includes(fragment)
    );
  };
  const hasNoFailureEffects = (
    metrics: CustomMppHttpConformanceMetrics
  ): boolean =>
    metrics.handlerCalls === 0 &&
    metrics.streamCalls === 0 &&
    metrics.accountingCount === 0 &&
    metrics.accountingTotal === '0' &&
    metrics.reservationCount === 0 &&
    metrics.reservationTotal === '0';

  {
    const service = await createService('success');
    try {
      for (const operation of ['invoke', 'stream'] as const) {
        const { authorization } = await httpChallenge(
          service,
          operation,
          'valid',
          timeoutMs,
          `http-success-${operation}-challenge`
        );
        const response = await adapterOperation(
          `http-success-${operation}-request`,
          timeoutMs,
          () => service.request(operation, authorization)
        );
        checks.push(
          safeCheck(
            `http-success-${operation}`,
            response.status >= 200 &&
              response.status < 300 &&
              (await responseIsRedacted(
                response,
                `http-success-${operation}-redaction`
              )) &&
              expectedReceiptMatches(
                options.expected.receipt,
                response.headers.get('Payment-Receipt') ?? undefined
              ),
            `Successful ${operation} must return 2xx with the provider receipt.`
          )
        );
      }
      const metrics = await httpMetrics(
        service,
        timeoutMs,
        'http-success-metrics'
      );
      checks.push(
        safeCheck(
          'http-success-accounting',
          metrics.handlerCalls === 1 &&
            metrics.streamCalls === 1 &&
            metrics.settlementCalls === 2 &&
            metrics.accountingCount ===
              options.expected.successfulAccountingCount &&
            metrics.accountingTotal ===
              options.expected.successfulAccountingTotal &&
            metrics.reservationCount === 0 &&
            metrics.reservationTotal === '0',
          'Invoke and stream success must settle and account exactly once each.'
        )
      );
    } finally {
      await closeHttpService(service, timeoutMs, 'http-success-close');
    }
  }

  {
    const service = await createService('credential-failure');
    try {
      const responses: Array<{
        id: string;
        response: Response;
      }> = [
        {
          id: 'missing-credential',
          response: await adapterOperation(
            'http-missing-credential-request',
            timeoutMs,
            () => service.request('invoke')
          ),
        },
        {
          id: 'malformed-credential',
          response: await adapterOperation(
            'http-malformed-credential-request',
            timeoutMs,
            () => service.request('invoke', 'Payment not-base64url')
          ),
        },
      ];
      for (const scenario of [
        'invalid-authenticity',
        'expired-credential',
        'wrong-context',
      ] as const) {
        const { authorization } = await httpChallenge(
          service,
          'invoke',
          scenario,
          timeoutMs,
          `http-${scenario}-challenge`
        );
        responses.push({
          id: scenario,
          response: await adapterOperation(
            `http-${scenario}-request`,
            timeoutMs,
            () => service.request('invoke', authorization)
          ),
        });
      }
      const metrics = await httpMetrics(
        service,
        timeoutMs,
        'http-credential-failure-metrics'
      );
      for (const { id, response } of responses) {
        checks.push(
          safeCheck(
            `http-${id}`,
            response.status === 402 &&
              response.headers.get('Payment-Receipt') === null &&
              (await responseIsRedacted(response, `http-${id}-redaction`)) &&
              metrics.settlementCalls === 0 &&
              hasNoFailureEffects(metrics),
            `${id} must return 402 without invoking handlers, settlement, accounting, or reservations.`
          )
        );
      }
    } finally {
      await closeHttpService(
        service,
        timeoutMs,
        'http-credential-failure-close'
      );
    }
  }

  {
    const service = await createService('handler-failure');
    try {
      const { authorization } = await httpChallenge(
        service,
        'invoke',
        'valid',
        timeoutMs,
        'http-handler-failure-challenge'
      );
      const response = await adapterOperation(
        'http-handler-failure-request',
        timeoutMs,
        () => service.request('invoke', authorization)
      );
      const metrics = await httpMetrics(
        service,
        timeoutMs,
        'http-handler-failure-metrics'
      );
      checks.push(
        safeCheck(
          'http-handler-failure',
          response.status >= 500 &&
            expectedReceiptMatches(
              options.expected.receipt,
              response.headers.get('Payment-Receipt') ?? undefined
            ) &&
            (await responseIsRedacted(
              response,
              'http-handler-failure-redaction'
            )) &&
            metrics.handlerCalls === 1 &&
            metrics.streamCalls === 0 &&
            metrics.settlementCalls === 1,
          'A post-settlement handler failure must stay failed and preserve its receipt.'
        )
      );
      checks.push(
        safeCheck(
          'http-handler-failure-accounting',
          metrics.accountingCount === 0 &&
            metrics.accountingTotal === '0' &&
            metrics.reservationCount === 0 &&
            metrics.reservationTotal === '0',
          'A failed handler must not retain accounting or policy reservations.'
        )
      );
    } finally {
      await closeHttpService(service, timeoutMs, 'http-handler-failure-close');
    }
  }

  {
    const service = await createService('settlement-failure');
    try {
      const { authorization } = await httpChallenge(
        service,
        'invoke',
        'valid',
        timeoutMs,
        'http-settlement-failure-challenge'
      );
      const response = await adapterOperation(
        'http-settlement-failure-request',
        timeoutMs,
        () => service.request('invoke', authorization)
      );
      const replay = await adapterOperation(
        'http-settlement-failure-replay-request',
        timeoutMs,
        () => service.request('invoke', authorization)
      );
      const metrics = await httpMetrics(
        service,
        timeoutMs,
        'http-settlement-failure-metrics'
      );
      checks.push(
        safeCheck(
          'http-settlement-failure',
          response.status >= 500 &&
            response.headers.get('Payment-Receipt') === null &&
            (await responseIsRedacted(
              response,
              'http-settlement-failure-redaction'
            )) &&
            metrics.handlerCalls === 0 &&
            metrics.streamCalls === 0 &&
            metrics.settlementCalls === 1 &&
            hasNoFailureEffects(metrics),
          'Settlement failure must return a redacted failure without handler or accounting effects.'
        )
      );
      checks.push(
        safeCheck(
          'http-settlement-failure-replay',
          replay.status >= 400 &&
            replay.headers.get('Payment-Receipt') === null &&
            metrics.settlementCalls === 1 &&
            (await responseIsRedacted(
              replay,
              'http-settlement-failure-replay-redaction'
            )),
          'Retrying an ambiguous settlement failure must not settle again.'
        )
      );
    } finally {
      await closeHttpService(
        service,
        timeoutMs,
        'http-settlement-failure-close'
      );
    }
  }

  {
    const service = await createService('verifier-timeout');
    try {
      const { authorization } = await httpChallenge(
        service,
        'invoke',
        'valid',
        timeoutMs,
        'http-verifier-timeout-challenge'
      );
      const response = await adapterOperation(
        'http-verifier-timeout-request',
        timeoutMs,
        () => service.request('invoke', authorization)
      );
      const replay = await adapterOperation(
        'http-verifier-timeout-replay-request',
        timeoutMs,
        () => service.request('invoke', authorization)
      );
      const metrics = await httpMetrics(
        service,
        timeoutMs,
        'http-verifier-timeout-metrics'
      );
      checks.push(
        safeCheck(
          'http-verifier-timeout',
          response.status >= 500 &&
            response.headers.get('Payment-Receipt') === null &&
            (await responseIsRedacted(
              response,
              'http-verifier-timeout-redaction'
            )) &&
            metrics.settlementCalls === 1 &&
            hasNoFailureEffects(metrics),
          'A provider timeout must fail closed without handler, accounting, or reservation effects.'
        )
      );
      checks.push(
        safeCheck(
          'http-verifier-timeout-replay',
          replay.status >= 400 &&
            replay.headers.get('Payment-Receipt') === null &&
            metrics.settlementCalls === 1 &&
            (await responseIsRedacted(
              replay,
              'http-verifier-timeout-replay-redaction'
            )),
          'Replaying a timed-out provider credential must not settle again.'
        )
      );
    } finally {
      await closeHttpService(service, timeoutMs, 'http-verifier-timeout-close');
    }
  }

  return {
    passed: checks.every(check => check.passed),
    checks,
  };
}
