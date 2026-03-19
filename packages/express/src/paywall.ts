import type { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import {
  paymentMiddlewareFromConfig,
  type SchemeRegistration,
} from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  HTTPFacilitatorClient,
  type FacilitatorConfig,
  type RouteConfig,
} from '@x402/core/server';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  resolvePayTo,
  validatePaymentsConfig,
  evaluateSender,
  findMostSpecificIncomingLimit,
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
  parseSIWxHeader,
  verifySIWxPayload,
  buildSIWxExtensionDeclaration,
  entrypointHasSIWx,
  type PaymentTracker,
  type SIWxStorage,
} from '@lucid-agents/payments';

const DEFAULT_SCHEME = 'exact';
const DEFAULT_SCHEMES: SchemeRegistration[] = [
  {
    network: 'eip155:*',
    server: new ExactEvmScheme(),
  },
];

type PaymentMiddlewareFactory = typeof paymentMiddlewareFromConfig;

export type WithPaymentsParams = {
  app: Express;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  middlewareFactory?: PaymentMiddlewareFactory;
  runtime?: AgentRuntime;
};

function addFacilitatorAuth(
  facilitator: FacilitatorConfig,
  token?: string
): FacilitatorConfig {
  if (facilitator.createAuthHeaders) {
    return facilitator;
  }

  const authHeaders = createFacilitatorAuthHeaders(token);
  if (!authHeaders) {
    return facilitator;
  }

  return {
    ...facilitator,
    createAuthHeaders: async () => authHeaders,
  };
}

/**
 * Extract host/domain from Express request for SIWX domain matching.
 */
function extractDomain(req: Request): string {
  const host = req.get('host') ?? 'localhost';
  // Strip port if present
  return host.split(':')[0];
}

/**
 * Build the resource URI for SIWX from the request path.
 */
function buildResourceUri(req: Request, path: string): string {
  const protocol = req.protocol ?? 'https';
  const host = req.get('host') ?? 'localhost';
  return `${protocol}://${host}${path}`;
}

/**
 * Register SIWX auth-only middleware for an entrypoint that has no price
 * but requires SIWX authentication.
 */
export function withSIWxAuthOnly({
  app,
  path,
  entrypoint,
  runtime,
}: {
  app: Express;
  path: string;
  entrypoint: EntrypointDef;
  runtime?: AgentRuntime;
}): boolean {
  const siwxConfig = runtime?.payments?.siwxConfig;
  const siwxStorage = runtime?.payments?.siwxStorage as SIWxStorage | undefined;

  if (!siwxConfig?.enabled || !siwxStorage) return false;
  if (!entrypoint.siwx?.authOnly) return false;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqPath = req.path ?? req.url ?? '';
    if (
      reqPath !== path &&
      !reqPath.startsWith(`${path}/`) &&
      req.originalUrl !== path &&
      !req.originalUrl?.startsWith(`${path}?`)
    ) {
      return next();
    }

    const siwxHeader = req.headers['sign-in-with-x'] as string | undefined;
    if (!siwxHeader) {
      return res.status(401).json({
        error: {
          code: 'siwx_required',
          message: 'SIWX authentication required',
        },
      });
    }

    const payload = parseSIWxHeader(siwxHeader);
    if (!payload) {
      return res.status(401).json({
        error: {
          code: 'siwx_invalid',
          message: 'Invalid SIWX header',
        },
      });
    }

    const domain = extractDomain(req);
    const resourceUri = buildResourceUri(req, path);

    verifySIWxPayload(payload, {
      storage: siwxStorage,
      resourceUri,
      domain,
      requireEntitlement: false,
      skipSignatureVerification: siwxConfig.verify?.skipSignatureVerification,
    })
      .then(result => {
        if (!result.success) {
          return res.status(401).json({
            error: {
              code: 'siwx_verification_failed',
              message: result.error ?? 'SIWX verification failed',
            },
          });
        }

        const authContext: AgentAuthContext = {
          scheme: 'siwx',
          address: result.address!,
          chainId: result.chainId!,
          grantedBy: 'auth-only',
          payload: payload as unknown as Record<string, unknown>,
        };
        (req as any).siwxAuth = authContext;
        return next();
      })
      .catch(() => {
        return res.status(401).json({
          error: {
            code: 'siwx_verification_failed',
            message: 'SIWX verification error',
          },
        });
      });
  });

  return true;
}

export function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  facilitator,
  middlewareFactory = paymentMiddlewareFromConfig,
  runtime,
}: WithPaymentsParams): boolean {
  if (!payments) return false;

  const network = entrypoint.network ?? payments.network;
  const price = resolvePrice(entrypoint, payments, kind);

  validatePaymentsConfig(payments, network, entrypoint.key);

  if (!price) return false;
  const payTo = resolvePayTo(payments);

  const description =
    entrypoint.description ??
    `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;
  const postMimeType =
    kind === 'stream' ? 'text/event-stream' : 'application/json';

  const baseFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: payments.facilitatorUrl } satisfies FacilitatorConfig);
  const resolvedFacilitator = addFacilitatorAuth(
    baseFacilitator,
    payments.facilitatorAuth
  );

  const postRoute: RouteConfig = {
    accepts: {
      scheme: DEFAULT_SCHEME,
      payTo: payTo as any,
      price,
      network,
    },
    description,
    mimeType: postMimeType,
  };

  const getRoute: RouteConfig = {
    accepts: {
      scheme: DEFAULT_SCHEME,
      payTo: payTo as any,
      price,
      network,
    },
    description,
    mimeType: 'application/json',
  };

  const policyGroups = runtime?.payments?.policyGroups;
  const paymentTracker = runtime?.payments?.paymentTracker as
    | PaymentTracker
    | undefined;

  // Determine if SIWX is enabled for this entrypoint
  const siwxConfig = runtime?.payments?.siwxConfig;
  const siwxStorage = runtime?.payments?.siwxStorage as SIWxStorage | undefined;
  const siwxEnabled =
    siwxStorage && siwxConfig?.enabled && entrypointHasSIWx(entrypoint, siwxConfig);

  // -------------------------------------------------------------------
  // SIWX Pre-payment middleware: check SIGN-IN-WITH-X header before x402.
  // If the wallet has a valid entitlement, bypass payment entirely.
  // -------------------------------------------------------------------
  if (siwxEnabled && siwxStorage) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath !== path &&
        !reqPath.startsWith(`${path}/`) &&
        req.originalUrl !== path &&
        !req.originalUrl?.startsWith(`${path}?`)
      ) {
        return next();
      }

      const siwxHeader = req.headers['sign-in-with-x'] as string | undefined;
      if (!siwxHeader) {
        return next(); // No SIWX header -> continue to payment middleware
      }

      const payload = parseSIWxHeader(siwxHeader);
      if (!payload) {
        return res.status(401).json({
          error: {
            code: 'siwx_invalid',
            message: 'Invalid SIWX header',
          },
        });
      }

      const domain = extractDomain(req);
      const resourceUri = buildResourceUri(req, path);

      verifySIWxPayload(payload, {
        storage: siwxStorage,
        resourceUri,
        domain,
        requireEntitlement: true,
        skipSignatureVerification: siwxConfig?.verify?.skipSignatureVerification,
      })
        .then(result => {
          if (!result.success) {
            // No entitlement - fall through to payment middleware
            return next();
          }

          // Valid SIWX with entitlement - bypass payment
          const authContext: AgentAuthContext = {
            scheme: 'siwx',
            address: result.address!,
            chainId: result.chainId!,
            grantedBy: 'entitlement',
            payload: payload as unknown as Record<string, unknown>,
          };
          (req as any).siwxAuth = authContext;
          return next('route'); // Skip remaining middleware on this path
        })
        .catch(() => {
          // On error, fall through to payment middleware
          return next();
        });
    });
  }

  // -------------------------------------------------------------------
  // Policy group sender evaluation (existing)
  // -------------------------------------------------------------------
  if (policyGroups && policyGroups.length > 0) {
    app.use((req, res, next) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath === path ||
        reqPath.startsWith(`${path}/`) ||
        req.originalUrl === path ||
        req.originalUrl?.startsWith(`${path}?`)
      ) {
        const origin =
          typeof req.headers.origin === 'string'
            ? req.headers.origin
            : Array.isArray(req.headers.origin)
              ? req.headers.origin[0]
              : undefined;
        const referer =
          typeof req.headers.referer === 'string'
            ? req.headers.referer
            : Array.isArray(req.headers.referer)
              ? req.headers.referer[0]
              : undefined;
        const senderDomain = extractSenderDomain(origin, referer);

        for (const group of policyGroups) {
          if (group.blockedSenders || group.allowedSenders) {
            const result = evaluateSender(group, undefined, senderDomain);
            if (!result.allowed) {
              return res.status(403).json({
                error: {
                  code: 'policy_violation',
                  message: result.reason || 'Payment blocked by policy',
                  groupName: result.groupName,
                },
              });
            }
          }
        }
      }
      return next();
    });
  }

  // -------------------------------------------------------------------
  // x402 payment middleware (existing)
  // -------------------------------------------------------------------
  const facilitatorClient = new HTTPFacilitatorClient(resolvedFacilitator);
  const routes: Record<string, RouteConfig> = {
    [`POST ${path}`]: postRoute,
    [`GET ${path}`]: getRoute,
  };

  const middleware = middlewareFactory(
    routes,
    facilitatorClient,
    DEFAULT_SCHEMES
  ) as RequestHandler;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqPath = req.path ?? req.url ?? '';
    if (
      reqPath === path ||
      reqPath.startsWith(`${path}/`) ||
      req.originalUrl === path ||
      req.originalUrl?.startsWith(`${path}?`)
    ) {
      // If SIWX already granted access, skip payment
      if ((req as any).siwxAuth) {
        return next();
      }

      const paymentHeader =
        (req.headers['payment'] as string | string[] | undefined) ??
        (req.headers['Payment'] as string | string[] | undefined);
      if (paymentHeader && !req.headers['x-payment']) {
        req.headers['x-payment'] = Array.isArray(paymentHeader)
          ? paymentHeader[0]
          : paymentHeader;
      }

      // Intercept 402 responses to add SIWX extension declaration
      if (siwxEnabled) {
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        const originalEnd = res.end.bind(res);

        const injectSIWxExtension = (body: any): any => {
          if (res.statusCode === 402 && body && typeof body === 'object') {
            const domain = extractDomain(req);
            const resourceUri = buildResourceUri(req, path);
            const siwxExtension = buildSIWxExtensionDeclaration({
              resourceUri,
              domain,
              statement: entrypoint.siwx?.statement ?? siwxConfig?.defaultStatement,
              chainId: network,
              expirationSeconds: siwxConfig?.expirationSeconds,
            });
            return {
              ...body,
              extensions: {
                ...(body.extensions ?? {}),
                siwx: siwxExtension,
              },
            };
          }
          return body;
        };

        res.json = function (body: any) {
          return originalJson(injectSIWxExtension(body));
        } as any;
      }

      return middleware(req, res, next);
    }
    return next();
  });

  // -------------------------------------------------------------------
  // Post-settlement: Record SIWX entitlement for the payer wallet
  // -------------------------------------------------------------------
  if (siwxEnabled && siwxStorage) {
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath !== path &&
        !reqPath.startsWith(`${path}/`) &&
        req.originalUrl !== path &&
        !req.originalUrl?.startsWith(`${path}?`)
      ) {
        return next();
      }

      // If SIWX already granted access, skip recording
      if ((req as any).siwxAuth) {
        return next();
      }

      const originalEnd = res.end.bind(res);
      let recordingPromise: Promise<void> | undefined;

      res.end = function (chunk?: any, encoding?: any, cb?: any) {
        if (recordingPromise) {
          recordingPromise
            .then(() => originalEnd(chunk, encoding, cb))
            .catch(error => {
              console.error(
                '[paywall] Error in SIWX entitlement recording, sending response anyway:',
                error
              );
              originalEnd(chunk, encoding, cb);
            });
          return res;
        }
        return originalEnd(chunk, encoding, cb);
      };

      next();

      const paymentResponseHeader = res.getHeader('PAYMENT-RESPONSE') as
        | string
        | undefined;
      if (
        paymentResponseHeader &&
        res.statusCode >= 200 &&
        res.statusCode < 300
      ) {
        try {
          const payerAddress = extractPayerAddress(paymentResponseHeader);
          if (payerAddress) {
            const resourceUri = buildResourceUri(req, path);
            recordingPromise = siwxStorage
              .recordPayment(resourceUri, payerAddress.toLowerCase(), network)
              .catch(error => {
                console.error(
                  '[paywall] Error recording SIWX entitlement:',
                  error
                );
              });
          }
        } catch (error) {
          console.error(
            '[paywall] Error processing SIWX entitlement recording:',
            error
          );
        }
      }
      return;
    });
  }

  // -------------------------------------------------------------------
  // Incoming payment recording (existing)
  // -------------------------------------------------------------------
  if (policyGroups && policyGroups.length > 0 && paymentTracker) {
    app.use(async (req, res, next) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath === path ||
        reqPath.startsWith(`${path}/`) ||
        req.originalUrl === path ||
        req.originalUrl?.startsWith(`${path}?`)
      ) {
        const originalEnd = res.end.bind(res);
        let recordingPromise: Promise<void> | undefined;

        res.end = function (chunk?: any, encoding?: any, cb?: any) {
          if (recordingPromise) {
            recordingPromise
              .then(() => {
                originalEnd(chunk, encoding, cb);
              })
              .catch(error => {
                console.error(
                  '[paywall] Error in payment recording, sending response anyway:',
                  error
                );
                originalEnd(chunk, encoding, cb);
              });
            return res;
          }
          return originalEnd(chunk, encoding, cb);
        };

        next();

        const paymentResponseHeader = res.getHeader('PAYMENT-RESPONSE') as
          | string
          | undefined;
        if (
          paymentResponseHeader &&
          res.statusCode >= 200 &&
          res.statusCode < 300
        ) {
          try {
            const payerAddress = extractPayerAddress(paymentResponseHeader);
            const origin =
              typeof req.headers.origin === 'string'
                ? req.headers.origin
                : Array.isArray(req.headers.origin)
                  ? req.headers.origin[0]
                  : undefined;
            const referer =
              typeof req.headers.referer === 'string'
                ? req.headers.referer
                : Array.isArray(req.headers.referer)
                  ? req.headers.referer[0]
                  : undefined;
            const senderDomain = extractSenderDomain(origin, referer);
            const paymentAmount = parsePriceAmount(price);

            if (payerAddress && paymentAmount !== undefined) {
              const recordPromises: Promise<void>[] = [];
              for (const group of policyGroups) {
                if (group.incomingLimits) {
                  const limitInfo = findMostSpecificIncomingLimit(
                    group.incomingLimits,
                    payerAddress,
                    senderDomain,
                    req.url
                  );
                  const scope = limitInfo?.scope ?? 'global';

                  recordPromises.push(
                    paymentTracker
                      .recordIncoming(group.name, scope, paymentAmount)
                      .catch(error => {
                        console.error(
                          `[paywall] Error recording incoming payment for group "${group.name}":`,
                          error
                        );
                      })
                  );
                }
              }
              recordingPromise = Promise.all(recordPromises).then(() => {});
            }
          } catch (error) {
            console.error(
              '[paywall] Error processing incoming payment:',
              error
            );
          }
        }
        return;
      }
      return next();
    });
  }

  return true;
}
