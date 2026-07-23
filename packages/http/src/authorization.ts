import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { MppRuntime } from '@lucid-agents/types/mpp';
import type {
  IncomingPaymentAdmission,
  PaymentsRuntime,
} from '@lucid-agents/types/payments';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';

export type AuthorizationRuntime = AgentRuntime<{
  payments?: PaymentsRuntime;
  mpp?: MppRuntime;
}>;

export type EntrypointAdmission =
  | { admitted: false; response: Response }
  | {
      admitted: true;
      abort: () => Promise<void>;
      isCommitted?: () => boolean;
      recoverCommittedResponse: (response: Response) => Response;
      finalize: (response: Response) => Promise<Response>;
    };

export type AdmittedEntrypointAdmission = Extract<
  EntrypointAdmission,
  { admitted: true }
>;

export type EntrypointAuthorization =
  | { authorized: false; response: Response }
  | {
      authorized: true;
      /** Stable verified caller identity for idempotency scoping. */
      subject?: string;
      auth?: AgentAuthContext;
      /** Add verified protocol response metadata without settling. */
      decorate: (response: Response) => Response;
      /** Reserve policy capacity after an idempotency claim is won. */
      admit: () => Promise<EntrypointAdmission>;
    };

export type EntrypointAuthorizationOptions = {
  /** Enable MPP replay recovery only for a validated, store-backed invoke. */
  allowMppIdempotencyRecovery?: boolean;
};

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  return /^0x[0-9a-f]{40}$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function paymentSubject(payer?: string, network?: string): string | undefined {
  if (!payer?.trim()) return undefined;
  return `payment:${network?.trim() ?? ''}:${normalizeAddress(payer)}`;
}

function authSubject(auth?: AgentAuthContext): string | undefined {
  if (!auth) return undefined;
  return `siwx:${auth.chainId}:${normalizeAddress(auth.address)}`;
}

function hasConfiguredPrice(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): boolean {
  if (typeof entrypoint.price === 'string') {
    return entrypoint.price.trim().length > 0;
  }
  const price = entrypoint.price?.[kind];
  return typeof price === 'string' && price.trim().length > 0;
}

function missingRailResponse(
  entrypoint: EntrypointDef,
  rail: string
): Response {
  return Response.json(
    {
      error: {
        code: 'payment_configuration_error',
        message: `Entrypoint "${entrypoint.key}" selects ${rail}, but that payment runtime is not configured.`,
      },
    },
    { status: 503 }
  );
}

function withPaymentReceipt(
  response: Response,
  receipt: string | undefined
): Response {
  if (!receipt) return response;
  const decorated = new Response(response.body, response);
  decorated.headers.set('Payment-Receipt', receipt);
  return decorated;
}

/**
 * Apply every transport-independent authorization rule for an entrypoint.
 * Adapters and task transports must enter through this gate before execution.
 */
export async function authorizeEntrypointRequest(
  request: Request,
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream',
  runtime: AuthorizationRuntime,
  trustedAuth?: AgentAuthContext,
  options?: EntrypointAuthorizationOptions
): Promise<EntrypointAuthorization> {
  const priced = hasConfiguredPrice(entrypoint, kind);
  if (priced && entrypoint.paymentProtocol === 'mpp' && !runtime.mpp) {
    return {
      authorized: false,
      response: missingRailResponse(entrypoint, 'MPP'),
    };
  }
  if (priced && entrypoint.paymentProtocol === 'x402' && !runtime.payments) {
    return {
      authorized: false,
      response: missingRailResponse(entrypoint, 'x402'),
    };
  }
  if (priced && !runtime.payments && !runtime.mpp) {
    return {
      authorized: false,
      response: missingRailResponse(entrypoint, 'a payment protocol'),
    };
  }
  if (
    entrypoint.siwx?.authOnly &&
    (!runtime.payments?.siwxConfig?.enabled || !runtime.payments.siwxStorage)
  ) {
    return {
      authorized: false,
      response: Response.json(
        {
          error: {
            code: 'authorization_configuration_error',
            message: `Entrypoint "${entrypoint.key}" is authOnly but no enabled SIWX runtime is configured.`,
          },
        },
        { status: 503 }
      ),
    };
  }

  const x402Requirement = runtime.payments?.requirements(entrypoint, kind);
  const mppRequirement = runtime.mpp?.requirements(entrypoint, kind);
  const x402Required = x402Requirement?.required === true;
  const mppRequired = mppRequirement?.required === true;

  if (x402Required && mppRequired) {
    return {
      authorized: false,
      response: Response.json(
        {
          error: {
            code: 'payment_configuration_error',
            message:
              `Entrypoint "${entrypoint.key}" requires both x402 and MPP. ` +
              'Select one paymentProtocol.',
          },
        },
        { status: 500 }
      ),
    };
  }

  let auth = trustedAuth;
  let subject = authSubject(trustedAuth);
  let admitPayments: (() => Promise<IncomingPaymentAdmission>) | undefined;
  let mppReceipt: string | undefined;
  let mppPayer: string | undefined;
  let mppNetwork: string | undefined;
  let reusedSIWxEntitlement = false;
  if (mppRequired && runtime.payments?.authorizeSIWx) {
    const siwxAuthorization = await runtime.payments.authorizeSIWx(
      request,
      entrypoint,
      kind
    );
    if (siwxAuthorization) {
      if (siwxAuthorization.authorized === false) return siwxAuthorization;
      auth = siwxAuthorization.auth ?? auth;
      subject = siwxAuthorization.subject ?? authSubject(auth) ?? subject;
      admitPayments = siwxAuthorization.admit;
      reusedSIWxEntitlement = true;
    }
  }

  if (!reusedSIWxEntitlement && runtime.mpp && mppRequired) {
    const authorization = await runtime.mpp.authorize(
      request,
      entrypoint,
      kind,
      mppRequirement,
      {
        allowIdempotencyRecovery: options?.allowMppIdempotencyRecovery === true,
      }
    );
    if (authorization.authorized === false) return authorization;
    mppReceipt = authorization.receipt;
    mppPayer = authorization.payer;
    mppNetwork = authorization.network;
    if (authorization.handled) {
      return {
        authorized: false,
        response: withPaymentReceipt(authorization.handled, mppReceipt),
      };
    }
    subject = paymentSubject(mppPayer, mppNetwork) ?? subject;
  }

  const decorate = (response: Response): Response =>
    withPaymentReceipt(response, mppReceipt);

  if (runtime.payments && !reusedSIWxEntitlement) {
    let authorization: Awaited<ReturnType<PaymentsRuntime['authorize']>>;
    try {
      authorization = await runtime.payments.authorize(
        request,
        entrypoint,
        kind,
        mppRequired
          ? {
              protocol: 'mpp',
              payer: mppPayer,
              amount: mppRequirement.amount,
              currency: mppRequirement.currency,
              network: mppNetwork,
            }
          : undefined
      );
    } catch (error) {
      if (!mppReceipt) throw error;
      return {
        authorized: false,
        response: decorate(
          Response.json(
            {
              error: {
                code: 'authorization_failed',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Payment authorization failed',
              },
            },
            { status: 503 }
          )
        ),
      };
    }
    if (authorization.authorized === false) {
      return {
        authorized: false,
        response: decorate(authorization.response),
      };
    }
    auth = authorization.auth ?? auth;
    subject = authorization.subject ?? authSubject(auth) ?? subject;
    admitPayments = authorization.admit;
  }

  return {
    authorized: true,
    subject,
    auth,
    decorate,
    admit: async () => {
      const admission = admitPayments
        ? await admitPayments()
        : {
            admitted: true as const,
            abort: async () => {},
            finalize: async (response: Response) => response,
          };
      if (!admission.admitted) {
        return {
          admitted: false,
          response: decorate(admission.response),
        };
      }
      return {
        admitted: true,
        abort: admission.abort,
        isCommitted:
          mppReceipt || admission.isCommitted
            ? () => Boolean(mppReceipt) || admission.isCommitted?.() === true
            : undefined,
        recoverCommittedResponse: response =>
          decorate(admission.recoverCommittedResponse?.(response) ?? response),
        finalize: async response =>
          decorate(await admission.finalize(response)),
      };
    },
  };
}
