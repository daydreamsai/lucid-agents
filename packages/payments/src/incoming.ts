import {
  HTTPFacilitatorClient,
  RouteConfigurationError,
  x402HTTPResourceServer,
  x402ResourceServer,
  type FacilitatorConfig,
  type HTTPAdapter,
  type HTTPResponseInstructions,
  type RouteConfig,
} from '@x402/core/server';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  IncomingPaymentAdmission,
  IncomingPaymentAuthorizer,
  IncomingPaymentAuthorization,
  IncomingPaymentFinalizeOptions,
  PaymentSettlementAdjustment,
  PaymentTracker,
  PaymentsConfig,
  VerifiedIncomingPayment,
} from '@lucid-agents/types/payments';
import type { AgentAuthContext, SIWxConfig } from '@lucid-agents/types/siwx';
import { decodePaymentRequiredHeader as decodeOfficialPaymentRequiredHeader } from '@x402/core/http';
import { createPublicClient, http } from 'viem';
import type { EVMMessageVerifier } from '@x402/extensions/sign-in-with-x';

import {
  evaluateIncomingPolicyGroups,
  findMostSpecificIncomingLimit,
} from './policy';
import { entrypointHasSIWx } from './siwx-entrypoint';
import type { SIWxStorage } from './siwx-storage';
import {
  buildSIWxExtensionDeclaration,
  enrichResponseWithSIWxChallenge,
  parseSIWxHeader,
  verifySIWxPayload,
} from './siwx-verify';
import { resolvePrice } from './pricing';
import { createFacilitatorAuthHeaders, parsePriceAmount } from './utils';
import { validatePaymentsConfig } from './validation';
import { compileX402Offers, type CompiledX402Offers } from './x402-offers';
import { registerSellerSchemes } from './x402-scheme-registry';
import {
  createFacilitatorRegistry,
  X402FacilitatorConfigurationError,
} from './x402-facilitator-registry';
import {
  normalizeSIWxPublicOrigin,
  resolveSIWxResourceUri,
} from './siwx-origin';
import {
  compileReconciliationExtensions,
  reconcilePaymentIdentifier,
  registerReconciliationExtensions,
  type X402Reconciliation,
  type X402ReconciliationOptions,
} from './x402-reconciliation';
import {
  batchSettlementReceiptHeaders,
  resolveBatchSettlementChargedAmount,
  type ResolvedBatchSettlementServerOptions,
} from './batch-settlement';

const MAX_CACHED_X402_SERVERS = 128;
const BATCH_CORRECTIVE_CHALLENGE_ERRORS = new Set([
  'invalid_batch_settlement_evm_cumulative_amount_mismatch',
  'invalid_batch_settlement_evm_cumulative_below_claimed',
]);

function hasBatchCorrectiveChallenge(response: Response): boolean {
  const paymentRequiredHeader = response.headers.get('PAYMENT-REQUIRED');
  if (!paymentRequiredHeader) return false;
  try {
    const error = decodeOfficialPaymentRequiredHeader(
      paymentRequiredHeader
    ).error;
    return (
      typeof error === 'string' && BATCH_CORRECTIVE_CHALLENGE_ERRORS.has(error)
    );
  } catch {
    return false;
  }
}

class X402ProviderError extends Error {
  constructor(cause: unknown) {
    super('x402 provider operation failed', { cause });
    this.name = 'X402ProviderError';
  }
}

class FetchHttpAdapter implements HTTPAdapter {
  constructor(
    private readonly request: Request,
    private readonly path: string
  ) {}

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.request.method.toUpperCase();
  }

  getPath(): string {
    return this.path;
  }

  getUrl(): string {
    return this.request.url;
  }

  getAcceptHeader(): string {
    return this.request.headers.get('Accept') ?? '';
  }

  getUserAgent(): string {
    return this.request.headers.get('User-Agent') ?? '';
  }

  getQueryParams(): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    for (const [key, value] of new URL(this.request.url).searchParams) {
      const current = result[key];
      result[key] = current
        ? Array.isArray(current)
          ? [...current, value]
          : [current, value]
        : value;
    }
    return result;
  }

  getQueryParam(name: string): string | string[] | undefined {
    const values = new URL(this.request.url).searchParams.getAll(name);
    if (values.length === 0) return undefined;
    return values.length === 1 ? values[0] : values;
  }
}

function facilitatorConfig(
  config: PaymentsConfig,
  facilitatorUrl: string
): FacilitatorConfig {
  const authHeaders = createFacilitatorAuthHeaders(config.facilitatorAuth);
  return {
    url: facilitatorUrl,
    ...(authHeaders ? { createAuthHeaders: async () => authHeaders } : {}),
  };
}

function responseFromInstructions(
  instructions: HTTPResponseInstructions
): Response {
  const headers = new Headers(instructions.headers);
  if (instructions.isHtml) {
    return new Response(String(instructions.body ?? ''), {
      status: instructions.status,
      headers,
    });
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(instructions.body ?? {}), {
    status: instructions.status,
    headers,
  });
}

function paymentSubject(payer?: string, network?: string): string | undefined {
  const trimmedPayer = payer?.trim();
  if (!trimmedPayer) return undefined;
  const normalizedPayer = /^0x[0-9a-f]{40}$/i.test(trimmedPayer)
    ? trimmedPayer.toLowerCase()
    : trimmedPayer;
  return `payment:${network?.trim() ?? ''}:${normalizedPayer}`;
}

function noOpAdmission(): IncomingPaymentAdmission {
  return {
    admitted: true,
    abort: async () => {},
    finalize: async response => response,
  };
}

function withSettlementHeaders(
  response: Response,
  headers: Record<string, string>
): Response {
  const decorated = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) {
    decorated.headers.set(name, value);
  }
  return decorated;
}

function incomingPoliciesRequireUsdAmount(config: PaymentsConfig): boolean {
  return (config.policyGroups ?? []).some(group => {
    const limits = group.incomingLimits;
    if (!limits) return false;
    const configured = [
      limits.global,
      ...Object.values(limits.perSender ?? {}),
      ...Object.values(limits.perEndpoint ?? {}),
    ];
    return configured.some(
      limit =>
        limit?.maxPaymentUsd !== undefined || limit?.maxTotalUsd !== undefined
    );
  });
}

function siwxEntitlementResource(
  publicResourceUri: string,
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): string {
  const resource = new URL(publicResourceUri);
  resource.hash = `lucid-entrypoint=${encodeURIComponent(entrypoint.key)}:${kind}`;
  return resource.toString();
}

async function addSIWxChallenge(
  response: Response,
  request: Request,
  entrypoint: EntrypointDef,
  config: SIWxConfig,
  networks: readonly string[]
): Promise<Response> {
  if (response.status !== 402) return response;

  const origin = normalizeSIWxPublicOrigin(config.origin);
  const resourceUri = resolveSIWxResourceUri(origin, request.url);
  const declaration = buildSIWxExtensionDeclaration({
    resourceUri,
    statement: entrypoint.siwx?.statement ?? config.defaultStatement,
    chainId: networks,
    expirationSeconds: config.expirationSeconds,
  });
  const parsedBody = await response
    .clone()
    .json()
    .catch(() => ({ error: 'Payment required' }));
  const body =
    parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? (parsedBody as Record<string, unknown>)
      : { error: parsedBody };
  const enriched = enrichResponseWithSIWxChallenge(
    body,
    declaration,
    402,
    response.headers.get('PAYMENT-REQUIRED')
  );
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(enriched.headers)) {
    headers.set(name, value);
  }
  return Response.json(enriched.body, {
    status: response.status,
    headers,
  });
}

function resolveSIWxNetworks(
  entrypoint: EntrypointDef,
  config: Pick<PaymentsConfig, 'network'>,
  compiled: CompiledX402Offers | undefined
): string[] {
  if (entrypoint.siwx?.network) return [entrypoint.siwx.network];
  if (compiled) {
    return [...new Set(compiled.offers.map(offer => offer.network))];
  }
  if (entrypoint.network) return [entrypoint.network];
  return [config.network];
}

function createSIWxEvmVerifier(
  rpcUrl: string | undefined
): EVMMessageVerifier | undefined {
  if (!rpcUrl) return undefined;
  const client = createPublicClient({ transport: http(rpcUrl) });
  return args => client.verifyMessage(args);
}

type CachedServer = {
  server: x402HTTPResourceServer;
  ready: Promise<void>;
  verifiedPayers: WeakMap<object, string>;
  extensions?: Record<string, unknown>;
};

type IncomingSettlement = {
  success: boolean;
  errorReason?: string;
  payer?: string;
  network?: string;
  amount?: string;
  extra?: Record<string, unknown>;
  headers: Record<string, string>;
};

function resolveMeteredActualAmount(
  ceiling: bigint,
  acceptedAsset: string | undefined,
  acceptedReference: string | undefined,
  mode: 'upto' | 'session',
  options: IncomingPaymentFinalizeOptions | undefined
): bigint {
  const settlement = options?.payment;
  if (!settlement) {
    throw new Error(
      `A ${mode} execution must provide payment.actualAmount during finalization`
    );
  }
  if (!/^\d+$/u.test(settlement.actualAmount)) {
    throw new Error(
      'payment.actualAmount must be a non-negative integer in atomic units'
    );
  }
  const actual = BigInt(settlement.actualAmount);
  if (actual > ceiling) {
    throw new Error(
      `payment.actualAmount exceeds the accepted ${mode} ceiling`
    );
  }
  if (
    settlement.asset &&
    acceptedAsset &&
    settlement.asset.toLowerCase() !== acceptedAsset.toLowerCase()
  ) {
    throw new Error(`payment.asset does not match the accepted ${mode} asset`);
  }
  if (acceptedReference && settlement.reference !== acceptedReference) {
    throw new Error(
      `payment.reference does not match the verified ${mode} reference`
    );
  }
  return actual;
}

function paymentErrorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Evaluate policy constraints that are knowable before another payment rail
 * verifies and potentially settles a credential.
 */
export async function preflightIncomingPayment(
  config: PaymentsConfig,
  tracker: PaymentTracker | undefined,
  request: Request,
  payment: Pick<VerifiedIncomingPayment, 'amount' | 'currency'>
): Promise<Response | undefined> {
  const groups = config.policyGroups ?? [];
  if (groups.length === 0) return undefined;
  if (!tracker) {
    return paymentErrorResponse(
      'payment_configuration_error',
      'Incoming payment policies require a payment tracker.',
      503
    );
  }

  let amount = 0n;
  if (incomingPoliciesRequireUsdAmount(config)) {
    const currency = payment.currency.trim().toLowerCase();
    const parsedAmount = parsePriceAmount(payment.amount);
    if (!parsedAmount || (currency !== 'usd' && currency !== 'usdc')) {
      return paymentErrorResponse(
        'payment_configuration_error',
        `Incoming payment policies require a positive USD-denominated amount; received ${payment.amount} ${payment.currency}.`,
        503
      );
    }
    amount = parsedAmount;
  }

  const evaluation = await evaluateIncomingPolicyGroups(
    groups,
    tracker,
    undefined,
    undefined,
    request.url,
    amount,
    undefined,
    { deferUnknownSenderAddress: true }
  );
  if (evaluation.allowed) return undefined;
  return Response.json(
    {
      error: {
        code: 'policy_violation',
        message: evaluation.reason ?? 'Payment blocked by policy',
        groupName: evaluation.groupName,
      },
    },
    { status: 403 }
  );
}

/**
 * Create a Fetch-native x402 authorizer owned by the payments package.
 * Framework adapters and task transports can share this exact verifier.
 */
export function createIncomingPaymentAuthorizer(
  config: PaymentsConfig,
  options?: {
    paymentTracker?: PaymentTracker;
    siwxStorage?: SIWxStorage;
    siwxConfig?: SIWxConfig;
    batchSettlement?: ResolvedBatchSettlementServerOptions;
    reconciliation?: X402ReconciliationOptions;
  }
): IncomingPaymentAuthorizer {
  const servers = new Map<string, Promise<CachedServer>>();
  const siwxOrigin = options?.siwxConfig?.enabled
    ? normalizeSIWxPublicOrigin(options.siwxConfig.origin)
    : undefined;
  const siwxEvmVerifier = createSIWxEvmVerifier(
    options?.siwxConfig?.verify?.evmRpcUrl
  );

  const getServer = async (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    compiled: CompiledX402Offers
  ): Promise<CachedServer> => {
    const url = new URL(request.url);
    url.hash = '';
    const resource = url.toString();
    const path = url.pathname;
    for (const offer of compiled.offers) {
      validatePaymentsConfig(config, offer.network, entrypoint.key);
    }

    const key = [
      request.method.toUpperCase(),
      resource,
      entrypoint.key,
      kind,
      JSON.stringify(compiled.offers.map(offer => offer.publicOffer)),
    ].join('|');
    const cached = servers.get(key);
    if (cached) {
      servers.delete(key);
      servers.set(key, cached);
      return cached;
    }

    const route: RouteConfig = {
      accepts: compiled.offers.map(offer => ({
        scheme: offer.scheme,
        payTo: offer.payTo as never,
        price: offer.price,
        network: offer.network,
      })),
      resource,
      description:
        entrypoint.description ??
        `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`,
      mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
      extensions: compileReconciliationExtensions(
        entrypoint,
        kind,
        compiled,
        options?.reconciliation
      ),
    };
    const value = (async (): Promise<CachedServer> => {
      const facilitators = await createFacilitatorRegistry(
        compiled,
        facilitatorUrl =>
          new HTTPFacilitatorClient(facilitatorConfig(config, facilitatorUrl))
      );
      const resourceServer = new x402ResourceServer(facilitators);
      registerReconciliationExtensions(resourceServer, options?.reconciliation);
      const verifiedPayers = new WeakMap<object, string>();
      resourceServer.onAfterVerify(async ({ paymentPayload, result }) => {
        if (result.payer) verifiedPayers.set(paymentPayload, result.payer);
      });
      await registerSellerSchemes(
        resourceServer,
        compiled.offers,
        options?.batchSettlement
      );
      const server = new x402HTTPResourceServer(resourceServer, {
        [`${request.method.toUpperCase()} ${path}`]: route,
      });
      const ready = server.initialize().catch((error: unknown) => {
        if (
          error instanceof RouteConfigurationError &&
          compiled.offers.some(
            offer =>
              !resourceServer.getSupportedKind(2, offer.network, offer.scheme)
          )
        ) {
          const unsupported = compiled.offers.filter(
            offer =>
              !resourceServer.getSupportedKind(2, offer.network, offer.scheme)
          );
          if (unsupported.length === 1) {
            const [offer] = unsupported;
            throw new X402FacilitatorConfigurationError(
              `Configured facilitator does not support x402 v2 ${offer!.scheme} payments on ${offer!.network}.`,
              { cause: error }
            );
          }
          throw new X402FacilitatorConfigurationError(
            `Configured facilitators do not support the following x402 v2 offers: ${unsupported
              .map(offer => `${offer.scheme} on ${offer.network}`)
              .join('; ')}.`,
            { cause: error }
          );
        }
        throw new Error('x402 facilitator initialization failed.', {
          cause: error,
        });
      });
      await ready;
      return {
        server,
        ready,
        verifiedPayers,
        extensions: route.extensions,
      };
    })();
    servers.set(key, value);
    while (servers.size > MAX_CACHED_X402_SERVERS) {
      const oldest = servers.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      servers.delete(oldest);
    }
    try {
      return await value;
    } catch (error) {
      if (servers.get(key) === value) servers.delete(key);
      throw error;
    }
  };

  const admitVerifiedIncoming = async (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    payment: {
      payer?: string;
      amount: bigint;
      network?: string;
      scheme?: string;
      asset?: string;
      reference?: string;
      maximumAmount?: bigint;
      settle?: (actualAmount?: string) => Promise<IncomingSettlement>;
      cancel?: (
        reason: 'handler_threw' | 'handler_failed' | 'after_verify_aborted',
        responseStatus?: number
      ) => Promise<void>;
    }
  ): Promise<IncomingPaymentAdmission> => {
    let canceled = false;
    const cancelVerified = async (
      reason: 'handler_threw' | 'handler_failed' | 'after_verify_aborted',
      responseStatus?: number
    ): Promise<void> => {
      if (canceled || !payment.cancel) return;
      canceled = true;
      await payment.cancel(reason, responseStatus);
    };
    const tracker = options?.paymentTracker;
    const groups = config.policyGroups ?? [];
    if (groups.length > 0 && !tracker) {
      await cancelVerified('after_verify_aborted');
      return {
        admitted: false,
        response: paymentErrorResponse(
          'payment_configuration_error',
          'Incoming payment policies require a payment tracker.',
          503
        ),
      };
    }

    if (groups.length > 0 && tracker) {
      const evaluation = await evaluateIncomingPolicyGroups(
        groups,
        tracker,
        payment.payer,
        undefined,
        request.url,
        payment.amount
      );
      if (!evaluation.allowed) {
        await cancelVerified('after_verify_aborted');
        return {
          admitted: false,
          response: Response.json(
            {
              error: {
                code: 'policy_violation',
                message: evaluation.reason ?? 'Payment blocked by policy',
                groupName: evaluation.groupName,
              },
            },
            { status: 403 }
          ),
        };
      }
    }

    const outstandingReservations = new Set<string>();
    const groupsWithTotalReservations = new Set<string>();
    const totalReservationIds = new Set<string>();
    const policyScopes = new Map<string, string>();
    let committed = false;
    let committedHeaders: Record<string, string> = {};

    const releaseOutstanding = async (): Promise<void> => {
      if (committed || !tracker || outstandingReservations.size === 0) return;
      const ids = [...outstandingReservations];
      const results = await Promise.allSettled(
        ids.map(id => tracker.releaseReservation(id))
      );
      let firstError: unknown;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          outstandingReservations.delete(ids[index]!);
        } else {
          firstError ??= result.reason;
        }
      });
      if (firstError) throw firstError;
    };

    if (groups.length > 0 && tracker) {
      try {
        for (const group of groups) {
          if (group.incomingLimits) {
            const limitInfo = findMostSpecificIncomingLimit(
              group.incomingLimits,
              payment.payer,
              undefined,
              request.url
            );
            const scope = limitInfo?.scope ?? 'global';
            policyScopes.set(group.name, scope);
            if (limitInfo?.limit.maxTotalUsd !== undefined) {
              const reservation = await tracker.reserveIncomingLimit(
                group.name,
                scope,
                limitInfo.limit.maxTotalUsd,
                limitInfo.limit.windowMs,
                payment.amount
              );
              if (!reservation.allowed || !reservation.reservationId) {
                await releaseOutstanding();
                await cancelVerified('after_verify_aborted');
                return {
                  admitted: false,
                  response: Response.json(
                    {
                      error: {
                        code: 'policy_violation',
                        message:
                          reservation.reason ?? 'Payment blocked by policy',
                        groupName: group.name,
                      },
                    },
                    { status: 403 }
                  ),
                };
              }
              outstandingReservations.add(reservation.reservationId);
              totalReservationIds.add(reservation.reservationId);
              groupsWithTotalReservations.add(group.name);
            }
          }

          if (group.rateLimits) {
            const reservation = await tracker.reserveRateLimit(
              group.name,
              'incoming',
              group.rateLimits.maxPayments,
              group.rateLimits.windowMs
            );
            if (!reservation.allowed || !reservation.reservationId) {
              await releaseOutstanding();
              await cancelVerified('after_verify_aborted');
              return {
                admitted: false,
                response: Response.json(
                  {
                    error: {
                      code: 'policy_violation',
                      message:
                        reservation.reason ?? 'Payment blocked by policy',
                      groupName: group.name,
                    },
                  },
                  { status: 403 }
                ),
              };
            }
            outstandingReservations.add(reservation.reservationId);
          }
        }
      } catch (error) {
        await releaseOutstanding().catch(() => undefined);
        await cancelVerified('after_verify_aborted').catch(() => undefined);
        throw error;
      }
    }

    const abortAdmission = async (): Promise<void> => {
      const results = await Promise.allSettled([
        releaseOutstanding(),
        cancelVerified('after_verify_aborted'),
      ]);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      );
      if (failure) throw failure.reason;
    };

    return {
      admitted: true,
      abort: abortAdmission,
      isCommitted: () => committed,
      recoverCommittedResponse: response =>
        withSettlementHeaders(response, committedHeaders),
      finalize: async (response, finalizeOptions) => {
        if (response.status >= 400) {
          try {
            await Promise.all([
              releaseOutstanding(),
              cancelVerified('handler_failed', response.status),
            ]);
            return response;
          } catch (error) {
            return paymentErrorResponse(
              'payment_reservation_release_failed',
              error instanceof Error
                ? error.message
                : 'Payment reservation release failed',
              503
            );
          }
        }

        let actualAmount = payment.amount;
        let settlementAmount: string | undefined;
        if (payment.scheme === 'upto' || payment.scheme === 'session') {
          try {
            actualAmount = resolveMeteredActualAmount(
              payment.maximumAmount ?? payment.amount,
              payment.asset,
              payment.reference,
              payment.scheme,
              finalizeOptions
            );
            if (payment.scheme === 'upto') {
              settlementAmount = actualAmount.toString();
            }
          } catch (error) {
            await Promise.allSettled([
              releaseOutstanding(),
              cancelVerified('handler_failed', 500),
            ]);
            return paymentErrorResponse(
              'invalid_payment_settlement',
              error instanceof Error
                ? error.message
                : `Invalid ${payment.scheme} settlement amount`,
              500
            );
          }
        }

        const accountingRecords =
          groups.length > 0 && tracker
            ? groups
                .filter(
                  group =>
                    group.incomingLimits &&
                    !groupsWithTotalReservations.has(group.name)
                )
                .map(group => ({
                  groupName: group.name,
                  scope: policyScopes.get(group.name) ?? 'global',
                  direction: 'incoming' as const,
                  amount: actualAmount,
                }))
            : [];
        const reservationAdjustments = [...totalReservationIds].map(
          reservationId => ({
            reservationId,
            amount: actualAmount,
          })
        );
        let settlementId: string | undefined;
        if (
          tracker &&
          (outstandingReservations.size > 0 || accountingRecords.length > 0)
        ) {
          try {
            settlementId = await tracker.stageSettlement(
              [...outstandingReservations],
              accountingRecords,
              reservationAdjustments
            );
            outstandingReservations.clear();
          } catch (error) {
            await releaseOutstanding().catch(() => undefined);
            return paymentErrorResponse(
              'payment_recording_failed',
              error instanceof Error
                ? error.message
                : 'Payment accounting could not be staged',
              503
            );
          }
        }

        let settlement: IncomingSettlement = {
          success: true,
          payer: payment.payer,
          network: payment.network,
          headers: {},
        };
        try {
          if (payment.settle) {
            settlement = await payment.settle(settlementAmount);
          }
        } catch {
          if (settlementId) {
            await tracker
              ?.releaseSettlement(settlementId)
              .catch(() => undefined);
          } else {
            await releaseOutstanding().catch(() => undefined);
          }
          return paymentErrorResponse(
            'settlement_failed',
            'Payment settlement is temporarily unavailable.',
            503
          );
        }

        if (!settlement.success) {
          if (settlementId) {
            await tracker
              ?.releaseSettlement(settlementId)
              .catch(() => undefined);
          } else {
            await releaseOutstanding().catch(() => undefined);
          }
          return paymentErrorResponse(
            'settlement_failed',
            'Payment settlement was rejected.',
            402,
            settlement.headers
          );
        }
        committedHeaders = { ...settlement.headers };
        committed = true;

        if (payment.scheme === 'batch-settlement') {
          try {
            actualAmount = resolveBatchSettlementChargedAmount(
              payment.amount,
              settlement
            );
          } catch (error) {
            // Settlement is irreversible. Preserve any staged ceiling so
            // accounting remains conservative until operators reconcile it.
            return paymentErrorResponse(
              'payment_recording_failed',
              error instanceof Error
                ? error.message
                : 'Batch settlement amount could not be reconciled',
              503,
              settlement.headers
            );
          }
        }

        const settledResponse = withSettlementHeaders(
          response,
          committedHeaders
        );

        if (settlementId && tracker) {
          try {
            if (payment.scheme === 'batch-settlement') {
              const adjustments: PaymentSettlementAdjustment[] = groups
                .filter(group => group.incomingLimits)
                .map(group => ({
                  groupName: group.name,
                  scope: policyScopes.get(group.name) ?? 'global',
                  direction: 'incoming',
                  amount: actualAmount,
                }));
              await tracker.adjustSettlement(settlementId, adjustments);
            }
            await tracker.commitSettlement(settlementId);
          } catch (error) {
            // Settlement is irreversible. The durable staged batch remains
            // counted without a TTL until accounting can be reconciled.
            return paymentErrorResponse(
              'payment_recording_failed',
              error instanceof Error
                ? error.message
                : 'Payment recording failed',
              503,
              settlement.headers
            );
          }
        }

        const entitlementPayer = settlement.payer ?? payment.payer;
        if (
          entitlementPayer &&
          options?.siwxStorage &&
          options.siwxConfig?.enabled &&
          entrypointHasSIWx(entrypoint, options.siwxConfig)
        ) {
          try {
            await options.siwxStorage.recordPayment(
              siwxEntitlementResource(
                resolveSIWxResourceUri(siwxOrigin!, request.url),
                entrypoint,
                kind
              ),
              entitlementPayer,
              settlement.network ?? payment.network
            );
          } catch (error) {
            return paymentErrorResponse(
              'payment_recording_failed',
              error instanceof Error
                ? error.message
                : 'SIWX entitlement recording failed',
              503,
              settlement.headers
            );
          }
        }

        return settledResponse;
      },
    };
  };

  const authorizeSIWx = async (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<IncomingPaymentAuthorization | undefined> => {
    if (
      entrypoint.siwx?.authOnly &&
      (!options?.siwxStorage || !options.siwxConfig?.enabled)
    ) {
      return {
        authorized: false,
        response: Response.json(
          {
            error: {
              code: 'authorization_configuration_error',
              message: `Entrypoint "${entrypoint.key}" is authOnly but SIWX is not configured.`,
            },
          },
          { status: 503 }
        ),
      };
    }

    if (
      options?.siwxStorage &&
      options.siwxConfig?.enabled &&
      entrypointHasSIWx(entrypoint, options.siwxConfig)
    ) {
      const siwxHeader = request.headers.get('SIGN-IN-WITH-X');
      const isAuthOnly = entrypoint.siwx?.authOnly === true;
      const resourceUri = resolveSIWxResourceUri(siwxOrigin!, request.url);
      const compiled = compileX402Offers(entrypoint, config, kind);
      const supportedChainIds = resolveSIWxNetworks(
        entrypoint,
        config,
        compiled
      );

      if (siwxHeader) {
        const payload = parseSIWxHeader(siwxHeader);
        if (payload) {
          const verification = await verifySIWxPayload(payload, {
            storage: options.siwxStorage,
            resourceUri,
            entitlementResource: siwxEntitlementResource(
              resourceUri,
              entrypoint,
              kind
            ),
            origin: siwxOrigin,
            requireEntitlement: !isAuthOnly,
            supportedChainIds,
            evmVerifier: siwxEvmVerifier,
            skipSignatureVerification:
              options.siwxConfig.verify?.skipSignatureVerification,
          });
          if (verification.success) {
            const auth: AgentAuthContext = {
              scheme: 'siwx',
              address: verification.address!,
              chainId: verification.chainId!,
              grantedBy: verification.grantedBy!,
              payload: payload as unknown as Record<string, unknown>,
            };
            return {
              authorized: true,
              subject: `siwx:${auth.chainId}:${
                /^0x[0-9a-f]{40}$/i.test(auth.address)
                  ? auth.address.toLowerCase()
                  : auth.address
              }`,
              auth,
              admit: async () => noOpAdmission(),
            };
          }
        }

        if (isAuthOnly) {
          return {
            authorized: false,
            response: Response.json(
              {
                error: {
                  code: 'auth_failed',
                  message: 'SIWX verification failed',
                },
              },
              { status: 401 }
            ),
          };
        }
      } else if (isAuthOnly) {
        const declaration = buildSIWxExtensionDeclaration({
          resourceUri,
          statement:
            entrypoint.siwx?.statement ?? options.siwxConfig.defaultStatement,
          chainId: supportedChainIds,
          expirationSeconds: options.siwxConfig.expirationSeconds,
        });
        const challengeBody = {
          x402Version: 2,
          error: {
            code: 'auth_required',
            message: 'Wallet authentication required',
          },
          resource: { url: resourceUri },
          accepts: [],
        };
        const enriched = enrichResponseWithSIWxChallenge(
          challengeBody,
          declaration,
          401
        );
        return {
          authorized: false,
          response: Response.json(enriched.body, {
            status: 401,
            headers: enriched.headers,
          }),
        };
      }
    }

    return undefined;
  };

  const authorize = async (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream',
    verifiedPayment?: VerifiedIncomingPayment
  ): Promise<IncomingPaymentAuthorization> => {
    const siwxAuthorization = await authorizeSIWx(request, entrypoint, kind);
    if (siwxAuthorization) return siwxAuthorization;

    const price = resolvePrice(entrypoint, config, kind);
    let compiled: CompiledX402Offers | undefined;
    try {
      compiled = verifiedPayment
        ? undefined
        : compileX402Offers(entrypoint, config, kind);
    } catch (error) {
      return {
        authorized: false,
        response: paymentErrorResponse(
          'payment_configuration_error',
          error instanceof Error
            ? error.message
            : 'Invalid x402 payment configuration.',
          503
        ),
      };
    }
    if ((!verifiedPayment && !compiled) || (verifiedPayment && !price)) {
      return {
        authorized: true,
        admit: async () => noOpAdmission(),
      };
    }

    let reconciliation: X402Reconciliation | undefined;
    if (
      kind === 'invoke' &&
      !verifiedPayment &&
      options?.reconciliation?.paymentIdentifier
    ) {
      const checked = reconcilePaymentIdentifier(
        request,
        options.reconciliation.paymentIdentifier.required ?? true
      );
      if (!checked.ok) {
        return { authorized: false, response: checked.response };
      }
      reconciliation = checked.metadata;
    }

    try {
      if (verifiedPayment) {
        const currency = verifiedPayment.currency.trim().toLowerCase();
        const requiresUsdAmount = incomingPoliciesRequireUsdAmount(config);
        let amount = 0n;
        if (requiresUsdAmount) {
          const parsedAmount = parsePriceAmount(verifiedPayment.amount);
          if (!parsedAmount || (currency !== 'usd' && currency !== 'usdc')) {
            return {
              authorized: false,
              response: paymentErrorResponse(
                'payment_configuration_error',
                `Incoming payment policies require a positive USD-denominated amount; received ${verifiedPayment.amount} ${verifiedPayment.currency}.`,
                503
              ),
            };
          }
          amount = parsedAmount;
        }
        let maximumAmount: bigint | undefined;
        if (verifiedPayment.intent === 'session') {
          if (
            !verifiedPayment.maximumAmount ||
            !/^\d+$/u.test(verifiedPayment.maximumAmount) ||
            BigInt(verifiedPayment.maximumAmount) <= 0n
          ) {
            return {
              authorized: false,
              response: paymentErrorResponse(
                'payment_configuration_error',
                'Verified MPP sessions require a positive atomic maximumAmount.',
                503
              ),
            };
          }
          maximumAmount = BigInt(verifiedPayment.maximumAmount);
        }
        const payment = {
          payer: verifiedPayment.payer,
          amount,
          network: verifiedPayment.network,
          scheme: verifiedPayment.intent,
          asset: verifiedPayment.currency,
          reference: verifiedPayment.reference,
          maximumAmount,
        };
        return {
          authorized: true,
          subject: paymentSubject(payment.payer, payment.network),
          admit: () =>
            admitVerifiedIncoming(request, entrypoint, kind, payment),
        };
      }

      if (entrypoint.paymentProtocol === 'mpp') {
        return {
          authorized: false,
          response: paymentErrorResponse(
            'payment_configuration_error',
            'MPP payment policy evaluation requires a verified MPP credential.',
            503
          ),
        };
      }

      if (config.policyGroups?.length && options?.paymentTracker) {
        if (
          incomingPoliciesRequireUsdAmount(config) &&
          compiled!.offers.some(offer => typeof offer.price !== 'string')
        ) {
          return {
            authorized: false,
            response: paymentErrorResponse(
              'payment_configuration_error',
              'Incoming USD payment policies require explicitly valued offers; token-denominated x402 amounts have no trusted USD valuation.',
              503
            ),
          };
        }
        const maximumAmount = compiled!.offers.reduce((maximum, offer) => {
          const amount =
            typeof offer.price === 'object'
              ? BigInt(offer.price.amount)
              : parsePriceAmount(String(offer.price));
          return amount !== undefined && amount > maximum ? amount : maximum;
        }, 0n);
        const evaluation = await evaluateIncomingPolicyGroups(
          config.policyGroups,
          options.paymentTracker,
          undefined,
          undefined,
          request.url,
          maximumAmount,
          undefined,
          { deferUnknownSenderAddress: true }
        );
        if (!evaluation.allowed) {
          return {
            authorized: false,
            response: Response.json(
              {
                error: {
                  code: 'policy_violation',
                  message: evaluation.reason ?? 'Payment blocked by policy',
                  groupName: evaluation.groupName,
                },
              },
              { status: 403 }
            ),
          };
        }
      }

      const url = new URL(request.url);
      let cached: CachedServer;
      let result: Awaited<
        ReturnType<x402HTTPResourceServer['processHTTPRequest']>
      >;
      try {
        cached = await getServer(request, entrypoint, kind, compiled!);
        await cached.ready;
        const adapter = new FetchHttpAdapter(request, url.pathname);
        result = await cached.server.processHTTPRequest({
          adapter,
          path: url.pathname,
          method: request.method.toUpperCase(),
          paymentHeader:
            adapter.getHeader('PAYMENT-SIGNATURE') ??
            adapter.getHeader('X-PAYMENT'),
        });
      } catch (error) {
        if (error instanceof X402FacilitatorConfigurationError) throw error;
        throw new X402ProviderError(error);
      }

      if (result.type === 'payment-error') {
        const response = responseFromInstructions(result.response);
        const responseBody = await response.clone().text();
        const hasCorrectiveChallenge = hasBatchCorrectiveChallenge(response);
        if (
          response.status >= 500 ||
          ((request.headers.has('PAYMENT-SIGNATURE') ||
            request.headers.has('X-PAYMENT')) &&
            (!responseBody.trim() || responseBody.trim() === '{}') &&
            !hasCorrectiveChallenge)
        ) {
          return {
            authorized: false,
            response: paymentErrorResponse(
              'payment_verification_failed',
              'x402 payment verification is temporarily unavailable.',
              503
            ),
          };
        }
        return {
          authorized: false,
          response:
            options?.siwxStorage &&
            options.siwxConfig?.enabled &&
            entrypointHasSIWx(entrypoint, options.siwxConfig)
              ? await addSIWxChallenge(
                  response,
                  request,
                  entrypoint,
                  options.siwxConfig,
                  resolveSIWxNetworks(entrypoint, config, compiled)
                )
              : response,
        };
      }

      if (result.type === 'no-payment-required') {
        return {
          authorized: true,
          reconciliation,
          admit: async () => noOpAdmission(),
        };
      }

      let amount: bigint | undefined;
      try {
        amount = BigInt(result.paymentRequirements.amount);
      } catch {
        amount = undefined;
      }
      const verifiedPayer = cached.verifiedPayers.get(result.paymentPayload);
      if (amount === undefined) {
        throw new Error(`Entrypoint "${entrypoint.key}" has an invalid price`);
      }
      const payment = {
        payer: verifiedPayer,
        amount,
        network: result.paymentRequirements.network,
        scheme: result.paymentRequirements.scheme,
        asset: result.paymentRequirements.asset,
        cancel: async (
          reason: 'handler_threw' | 'handler_failed' | 'after_verify_aborted',
          responseStatus?: number
        ) =>
          result.cancellationDispatcher.cancel({
            reason,
            ...(responseStatus === undefined ? {} : { responseStatus }),
          }),
        settle: async (actualAmount?: string) => {
          const settlement = (await cached.server.processSettlement(
            result.paymentPayload,
            result.paymentRequirements,
            cached.extensions,
            {
              request: {
                adapter: new FetchHttpAdapter(request, url.pathname),
                path: url.pathname,
                method: request.method.toUpperCase(),
                paymentHeader:
                  request.headers.get('PAYMENT-SIGNATURE') ??
                  request.headers.get('X-PAYMENT') ??
                  undefined,
              },
            },
            actualAmount === undefined ? undefined : { amount: actualAmount }
          )) as IncomingSettlement;
          return {
            ...settlement,
            headers: {
              ...settlement.headers,
              ...batchSettlementReceiptHeaders(
                result.paymentPayload,
                settlement
              ),
            },
          };
        },
      };
      return {
        authorized: true,
        subject: paymentSubject(payment.payer, payment.network),
        reconciliation,
        admit: () => admitVerifiedIncoming(request, entrypoint, kind, payment),
      };
    } catch (error) {
      return {
        authorized: false,
        response: Response.json(
          {
            error: {
              code: 'payment_configuration_error',
              message:
                error instanceof X402ProviderError
                  ? 'x402 payment verification is temporarily unavailable.'
                  : error instanceof Error
                    ? error.message
                    : 'Payment authorization failed',
            },
          },
          { status: 503 }
        ),
      };
    }
  };

  return Object.assign(authorize, { authorizeSIWx });
}
