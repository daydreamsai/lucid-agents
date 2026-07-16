import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import type { PaymentTracker } from '@lucid-agents/types/payments';
import type { RateLimiter } from './rate-limiter';
import { evaluatePolicyGroups, findMostSpecificOutgoingLimit } from './policy';
import { decodePaymentRequiredHeader, parsePriceAmount } from './utils';

const MAX_OUTSTANDING_ATTEMPTS = 10_000;
const ATTEMPT_TTL_MS = 5 * 60 * 1_000;

export type PolicyWrapperOptions = {
  maxOutstandingAttempts?: number;
  attemptTtlMs?: number;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Extracts the URL string from fetch input.
 * @param input - Request info (string, URL, or Request object)
 * @returns URL string representation
 */
function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Extracts the domain from a URL.
 * @param url - URL string to extract domain from
 * @returns Hostname if URL is valid, undefined otherwise
 */
function extractDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

/**
 * Parses payment amount from a price string (assumes USDC with 6 decimals).
 * @param price - Price string (e.g., "1.5" for $1.50)
 * @returns Amount in base units (with 6 decimals), or undefined if invalid
 */
/**
 * Extracts payment amount from response headers.
 * @param response - HTTP response object
 * @returns Payment amount in base units from PAYMENT-REQUIRED header
 */
function extractPaymentAmount(response: Response): bigint | undefined {
  const required = decodePaymentRequiredHeader(
    response.headers.get('PAYMENT-REQUIRED')
  );
  return required?.price ? parsePriceAmount(required.price) : undefined;
}

/**
 * Extracts recipient address from payment request headers or response.
 * @param request - HTTP request object
 * @param response - HTTP response object
 * @returns Recipient address from PAYMENT-REQUIRED header
 */
function extractRecipientAddress(
  _request: Request,
  response: Response
): string | undefined {
  const required = decodePaymentRequiredHeader(
    response.headers.get('PAYMENT-REQUIRED')
  );
  return required?.payTo;
}

type PaymentInfo = {
  amount: bigint;
  recipientAddress?: string;
  recipientDomain?: string;
};

type ReservedPolicyGroup = {
  groupName: string;
  scope: string;
  recordsPayment: boolean;
};

type ReservedPaymentAttempt = {
  id: string;
  payment: PaymentInfo;
  reservationIds: string[];
  groups: ReservedPolicyGroup[];
  timer?: ReturnType<typeof setTimeout>;
};

function isPaidRequest(request: Request): boolean {
  return (
    request.headers.has('PAYMENT-SIGNATURE') || request.headers.has('X-PAYMENT')
  );
}

async function requestFingerprint(request: Request): Promise<string> {
  const headers = [...request.headers.entries()]
    .filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        normalized !== 'payment-signature' &&
        normalized !== 'x-payment' &&
        normalized !== 'access-control-expose-headers'
      );
    })
    .sort(([left], [right]) => left.localeCompare(right));
  const body = await request.clone().text();
  const material = JSON.stringify({
    method: request.method.toUpperCase(),
    url: request.url,
    headers,
    body,
  });
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function policyViolationResponse(
  reason: string,
  groupName?: string,
  status = 403
): Response {
  return Response.json(
    {
      error: {
        code: status === 403 ? 'policy_violation' : 'policy_storage_error',
        message: reason,
        groupName,
      },
    },
    { status }
  );
}

/**
 * Creates a policy wrapper around the BASE fetch (before x402 wrapper).
 * This wrapper is applied BEFORE the x402 wrapper so we can intercept
 * the 402 response and check policies before payment happens.
 *
 * Flow:
 * 1. Wraps the base fetch function
 * 2. Intercepts 402 responses to extract payment information
 * 3. Evaluates policies against spending limits and rate limits
 * 4. Returns 403 if policy violation, otherwise allows payment
 * 5. Records spending/rate limit data after successful payment
 *
 * @param baseFetch - The base fetch function to wrap
 * @param policyGroups - Array of payment policy groups to evaluate
 * @param paymentTracker - Tracker for enforcing payment limits
 * @param rateLimiter - Limiter for enforcing rate limits
 * @returns Wrapped fetch function that enforces payment policies
 */
export function wrapBaseFetchWithPolicy(
  baseFetch: FetchLike,
  policyGroups: PaymentPolicyGroup[],
  paymentTracker: PaymentTracker,
  rateLimiter?: RateLimiter,
  options: PolicyWrapperOptions = {}
): FetchLike {
  const maxOutstandingAttempts =
    options.maxOutstandingAttempts ?? MAX_OUTSTANDING_ATTEMPTS;
  const attemptTtlMs = options.attemptTtlMs ?? ATTEMPT_TTL_MS;
  const attempts = new Map<string, ReservedPaymentAttempt[]>();
  const attemptOrder = new Map<
    string,
    { requestKey: string; attempt: ReservedPaymentAttempt }
  >();
  let attemptOperationQueue: Promise<void> = Promise.resolve();

  const withAttemptLock = async <T>(
    operation: () => T | Promise<T>
  ): Promise<T> => {
    const previous = attemptOperationQueue;
    let release: () => void = () => {};
    attemptOperationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  };

  if (
    !Number.isSafeInteger(maxOutstandingAttempts) ||
    maxOutstandingAttempts < 1
  ) {
    throw new Error('maxOutstandingAttempts must be a positive integer');
  }
  if (!Number.isFinite(attemptTtlMs) || attemptTtlMs <= 0) {
    throw new Error('attemptTtlMs must be a positive number');
  }

  const releaseAttempt = async (
    attempt: ReservedPaymentAttempt | undefined
  ): Promise<void> => {
    if (!attempt) return;
    if (attempt.timer) clearTimeout(attempt.timer);
    await Promise.all(
      attempt.reservationIds.map(id => paymentTracker.releaseReservation(id))
    );
  };

  const removeAttempt = (
    requestKey: string,
    attempt: ReservedPaymentAttempt
  ): void => {
    const queue = attempts.get(requestKey);
    if (queue) {
      const index = queue.findIndex(candidate => candidate.id === attempt.id);
      if (index >= 0) queue.splice(index, 1);
      if (queue.length === 0) attempts.delete(requestKey);
    }
    attemptOrder.delete(attempt.id);
    if (attempt.timer) clearTimeout(attempt.timer);
  };

  const dequeueAttempt = (
    requestKey: string
  ): ReservedPaymentAttempt | undefined => {
    const queue = attempts.get(requestKey);
    const attempt = queue?.shift();
    if (queue?.length === 0) attempts.delete(requestKey);
    if (attempt) {
      attemptOrder.delete(attempt.id);
      if (attempt.timer) clearTimeout(attempt.timer);
    }
    return attempt;
  };

  const enqueueAttempt = (
    requestKey: string,
    attempt: ReservedPaymentAttempt
  ): void => {
    const queue = attempts.get(requestKey) ?? [];
    queue.push(attempt);
    attempts.set(requestKey, queue);
    attemptOrder.set(attempt.id, { requestKey, attempt });
    attempt.timer = setTimeout(
      () => expireAttempt(requestKey, attempt.id),
      attemptTtlMs
    );
    const timer = attempt.timer as ReturnType<typeof setTimeout> & {
      unref?: () => void;
    };
    timer.unref?.();
  };

  const expireAttempt = (requestKey: string, attemptId: string): void => {
    void withAttemptLock(async () => {
      const attempt = attemptOrder.get(attemptId)?.attempt;
      if (!attempt) return;
      removeAttempt(requestKey, attempt);
      await releaseAttempt(attempt);
    }).catch(error => {
      console.error(
        '[lucid-agents/payments] Failed to release expired payment policy reservation',
        error
      );
    });
  };

  const ensureAttemptCapacity = async (): Promise<void> => {
    while (attemptOrder.size >= maxOutstandingAttempts) {
      const oldest = attemptOrder.values().next().value as
        | { requestKey: string; attempt: ReservedPaymentAttempt }
        | undefined;
      if (!oldest) break;
      removeAttempt(oldest.requestKey, oldest.attempt);
      await releaseAttempt(oldest.attempt);
    }
  };

  const takeAttempt = (requestKey: string) =>
    withAttemptLock(() => dequeueAttempt(requestKey));

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const urlString = getUrlString(request);
    const targetUrl = urlString;
    const endpointUrl = urlString;
    const targetDomain = extractDomain(urlString);
    const requestKey = await requestFingerprint(request);
    const paidRequest = isPaidRequest(request);

    let response: Response;
    try {
      response = await baseFetch(request);
    } catch (error) {
      if (paidRequest) {
        await releaseAttempt(await takeAttempt(requestKey));
      }
      throw error;
    }

    if (response.status === 402) {
      if (paidRequest) {
        await releaseAttempt(await takeAttempt(requestKey));
        return response;
      }
      const paymentAmount = extractPaymentAmount(response);
      const recipientAddress = extractRecipientAddress(request, response);

      if (paymentAmount !== undefined) {
        return withAttemptLock(async () => {
          await ensureAttemptCapacity();
          let evaluation;
          try {
            evaluation = await evaluatePolicyGroups(
              policyGroups,
              paymentTracker,
              rateLimiter,
              urlString,
              urlString,
              paymentAmount,
              recipientAddress || undefined,
              targetDomain
            );
          } catch (error) {
            return policyViolationResponse(
              error instanceof Error
                ? error.message
                : 'Payment policy storage is unavailable',
              undefined,
              503
            );
          }

          if (!evaluation.allowed) {
            return policyViolationResponse(
              evaluation.reason || 'Payment blocked by policy',
              evaluation.groupName
            );
          }

          const attempt: ReservedPaymentAttempt = {
            id: globalThis.crypto.randomUUID(),
            payment: {
              amount: paymentAmount,
              recipientAddress: recipientAddress || undefined,
              recipientDomain: targetDomain,
            },
            reservationIds: [],
            groups: [],
          };

          try {
            for (const group of policyGroups) {
              let scope = 'global';
              let recordsPayment = false;
              if (group.outgoingLimits) {
                recordsPayment = true;
                const limitInfo = findMostSpecificOutgoingLimit(
                  group.outgoingLimits,
                  targetUrl,
                  endpointUrl
                );
                scope = limitInfo?.scope ?? 'global';
                if (limitInfo?.limit.maxTotalUsd !== undefined) {
                  const reservation = await paymentTracker.reserveOutgoingLimit(
                    group.name,
                    scope,
                    limitInfo.limit.maxTotalUsd,
                    limitInfo.limit.windowMs,
                    paymentAmount
                  );
                  if (!reservation.allowed || !reservation.reservationId) {
                    await releaseAttempt(attempt);
                    return policyViolationResponse(
                      reservation.reason ?? 'Payment blocked by policy',
                      group.name
                    );
                  }
                  attempt.reservationIds.push(reservation.reservationId);
                  recordsPayment = false;
                }
              }

              if (group.rateLimits) {
                const reservation = await paymentTracker.reserveRateLimit(
                  group.name,
                  'outgoing',
                  group.rateLimits.maxPayments,
                  group.rateLimits.windowMs
                );
                if (!reservation.allowed || !reservation.reservationId) {
                  await releaseAttempt(attempt);
                  return policyViolationResponse(
                    reservation.reason ?? 'Payment blocked by policy',
                    group.name
                  );
                }
                attempt.reservationIds.push(reservation.reservationId);
              }
              attempt.groups.push({
                groupName: group.name,
                scope,
                recordsPayment,
              });
            }
          } catch (error) {
            await releaseAttempt(attempt);
            return policyViolationResponse(
              error instanceof Error
                ? error.message
                : 'Payment policy storage is unavailable',
              undefined,
              503
            );
          }

          enqueueAttempt(requestKey, attempt);
          return response;
        });
      }

      return response;
    }

    const attempt = paidRequest ? await takeAttempt(requestKey) : undefined;
    if (
      attempt &&
      response.ok &&
      response.status >= 200 &&
      response.status < 300
    ) {
      const paymentResponseHeader = response.headers.get('PAYMENT-RESPONSE');
      if (paymentResponseHeader) {
        try {
          await paymentTracker.commitReservations(
            attempt.reservationIds,
            attempt.groups
              .filter(group => group.recordsPayment)
              .map(group => ({
                groupName: group.groupName,
                scope: group.scope,
                direction: 'outgoing' as const,
                amount: attempt.payment.amount,
              }))
          );
        } catch (error) {
          await releaseAttempt(attempt);
          return policyViolationResponse(
            error instanceof Error ? error.message : 'Payment recording failed',
            undefined,
            503
          );
        }
      } else {
        await releaseAttempt(attempt);
      }
    } else if (attempt) {
      await releaseAttempt(attempt);
    }

    return response;
  };
}
