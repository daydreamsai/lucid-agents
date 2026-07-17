import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
  type FacilitatorConfig,
  type HTTPAdapter,
  type HTTPResponseInstructions,
  type RouteConfig,
} from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  IncomingPaymentAdmission,
  IncomingPaymentAuthorizer,
  IncomingPaymentAuthorization,
  PaymentTracker,
  PaymentsConfig,
  VerifiedIncomingPayment,
} from '@lucid-agents/types/payments';
import type { AgentAuthContext, SIWxConfig } from '@lucid-agents/types/siwx';

import { resolvePayTo } from './payto-resolver';
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
import { encodeBase64Utf8 } from './base64';

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

function facilitatorConfig(config: PaymentsConfig): FacilitatorConfig {
  const authHeaders = createFacilitatorAuthHeaders(config.facilitatorAuth);
  return {
    url: config.facilitatorUrl,
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
  requestUrl: string,
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): string {
  const resource = new URL(requestUrl);
  resource.hash = `lucid-entrypoint=${encodeURIComponent(entrypoint.key)}:${kind}`;
  return resource.toString();
}

async function addSIWxChallenge(
  response: Response,
  request: Request,
  entrypoint: EntrypointDef,
  config: SIWxConfig
): Promise<Response> {
  if (response.status !== 402) return response;

  const url = new URL(request.url);
  const declaration = buildSIWxExtensionDeclaration({
    resourceUri: request.url,
    domain: url.hostname,
    statement: entrypoint.siwx?.statement ?? config.defaultStatement,
    chainId: entrypoint.siwx?.network ?? entrypoint.network,
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
  const enriched = enrichResponseWithSIWxChallenge(body, declaration, 402);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(enriched.headers)) {
    headers.set(name, value);
  }
  return Response.json(enriched.body, {
    status: response.status,
    headers,
  });
}

type CachedServer = {
  server: x402HTTPResourceServer;
  ready: Promise<void>;
  verifiedPayers: WeakMap<object, string>;
};

type IncomingSettlement = {
  success: boolean;
  errorReason?: string;
  payer?: string;
  network?: string;
  headers: Record<string, string>;
};

function paymentErrorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
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
  }
): IncomingPaymentAuthorizer {
  const servers = new Map<string, Promise<CachedServer>>();

  const getServer = async (
    request: Request,
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ): Promise<CachedServer> => {
    const url = new URL(request.url);
    const path = url.pathname;
    const network = entrypoint.network ?? config.network;
    const price = resolvePrice(entrypoint, config, kind);
    validatePaymentsConfig(config, network, entrypoint.key);
    if (!price) {
      throw new Error(`Entrypoint "${entrypoint.key}" has no ${kind} price`);
    }

    const payTo = resolvePayTo(config);
    const key = [
      request.method.toUpperCase(),
      path,
      entrypoint.key,
      kind,
      price,
      network,
    ].join('|');
    const cached = servers.get(key);
    if (cached) return cached;

    const route: RouteConfig = {
      accepts: {
        scheme: 'exact',
        payTo: payTo as never,
        price,
        network,
      },
      resource: request.url,
      description:
        entrypoint.description ??
        `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`,
      mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
    };
    const value = (async (): Promise<CachedServer> => {
      const facilitator = new HTTPFacilitatorClient(facilitatorConfig(config));
      const resourceServer = new x402ResourceServer(facilitator);
      const verifiedPayers = new WeakMap<object, string>();
      resourceServer.onAfterVerify(async ({ paymentPayload, result }) => {
        if (result.payer) verifiedPayers.set(paymentPayload, result.payer);
      });
      if (network.startsWith('solana:')) {
        // The SVM server pulls in Node-oriented WebSocket support. Keep it off
        // the portable root import path and load it only for Solana receivers.
        const { ExactSvmScheme } = await import('@x402/svm/exact/server');
        resourceServer.register('solana:*', new ExactSvmScheme());
      } else {
        resourceServer.register('eip155:*', new ExactEvmScheme());
      }
      const server = new x402HTTPResourceServer(resourceServer, {
        [`${request.method.toUpperCase()} ${path}`]: route,
      });
      const ready = server.initialize();
      await ready;
      return { server, ready, verifiedPayers };
    })();
    servers.set(key, value);
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
      settle?: () => Promise<IncomingSettlement>;
    }
  ): Promise<IncomingPaymentAdmission> => {
    const tracker = options?.paymentTracker;
    const groups = config.policyGroups ?? [];
    if (groups.length > 0 && !tracker) {
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
    const policyScopes = new Map<string, string>();
    let committed = false;

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
        throw error;
      }
    }

    return {
      admitted: true,
      abort: releaseOutstanding,
      isCommitted: () => committed,
      finalize: async response => {
        if (response.status >= 400) {
          try {
            await releaseOutstanding();
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
                  amount: payment.amount,
                }))
            : [];
        let settlementId: string | undefined;
        if (
          tracker &&
          (outstandingReservations.size > 0 || accountingRecords.length > 0)
        ) {
          try {
            settlementId = await tracker.stageSettlement(
              [...outstandingReservations],
              accountingRecords
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
          if (payment.settle) settlement = await payment.settle();
        } catch (error) {
          if (settlementId) {
            await tracker
              ?.releaseSettlement(settlementId)
              .catch(() => undefined);
          } else {
            await releaseOutstanding().catch(() => undefined);
          }
          return paymentErrorResponse(
            'settlement_failed',
            error instanceof Error ? error.message : 'Settlement failed',
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
            settlement.errorReason ?? 'Settlement failed',
            402,
            settlement.headers
          );
        }
        committed = true;

        const settledResponse = new Response(response.body, response);
        for (const [name, value] of Object.entries(settlement.headers)) {
          settledResponse.headers.set(name, value);
        }

        if (settlementId && tracker) {
          try {
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
              siwxEntitlementResource(request.url, entrypoint, kind),
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
      const siwxHeader =
        request.headers.get('SIGN-IN-WITH-X') ??
        request.headers.get('X-SIGN-IN-WITH-X');
      const isAuthOnly = entrypoint.siwx?.authOnly === true;

      if (siwxHeader) {
        const payload = parseSIWxHeader(siwxHeader);
        if (payload) {
          const url = new URL(request.url);
          const verification = await verifySIWxPayload(payload, {
            storage: options.siwxStorage,
            resourceUri: request.url,
            entitlementResource: siwxEntitlementResource(
              request.url,
              entrypoint,
              kind
            ),
            domain: url.hostname,
            requireEntitlement: !isAuthOnly,
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
        const url = new URL(request.url);
        const declaration = buildSIWxExtensionDeclaration({
          resourceUri: request.url,
          domain: url.hostname,
          statement:
            entrypoint.siwx?.statement ?? options.siwxConfig.defaultStatement,
          chainId: entrypoint.siwx?.network ?? entrypoint.network,
          expirationSeconds: options.siwxConfig.expirationSeconds,
        });
        return {
          authorized: false,
          response: Response.json(
            {
              error: {
                code: 'auth_required',
                message: 'Wallet authentication required',
                siwx: declaration,
              },
            },
            {
              status: 401,
              headers: {
                'X-SIWX-EXTENSION': encodeBase64Utf8(
                  JSON.stringify(declaration)
                ),
              },
            }
          ),
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
    if (!price) {
      return {
        authorized: true,
        admit: async () => noOpAdmission(),
      };
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
        const payment = {
          payer: verifiedPayment.payer,
          amount,
          network: verifiedPayment.network,
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
        const evaluation = await evaluateIncomingPolicyGroups(
          config.policyGroups,
          options.paymentTracker,
          undefined,
          undefined,
          request.url,
          parsePriceAmount(price),
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
      const cached = await getServer(request, entrypoint, kind);
      await cached.ready;
      const adapter = new FetchHttpAdapter(request, url.pathname);
      const result = await cached.server.processHTTPRequest({
        adapter,
        path: url.pathname,
        method: request.method.toUpperCase(),
        paymentHeader:
          adapter.getHeader('PAYMENT-SIGNATURE') ??
          adapter.getHeader('X-PAYMENT'),
      });

      if (result.type === 'payment-error') {
        const response = responseFromInstructions(result.response);
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
                  options.siwxConfig
                )
              : response,
        };
      }

      if (result.type === 'no-payment-required') {
        return {
          authorized: true,
          admit: async () => noOpAdmission(),
        };
      }

      const amount = parsePriceAmount(price);
      const verifiedPayer = cached.verifiedPayers.get(result.paymentPayload);
      if (amount === undefined) {
        throw new Error(`Entrypoint "${entrypoint.key}" has an invalid price`);
      }
      const payment = {
        payer: verifiedPayer,
        amount,
        network: result.paymentRequirements.network,
        settle: async () =>
          (await cached.server.processSettlement(
            result.paymentPayload,
            result.paymentRequirements
          )) as IncomingSettlement,
      };
      return {
        authorized: true,
        subject: paymentSubject(payment.payer, payment.network),
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
                error instanceof Error
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
