import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

import type { PaymentTracker } from './payment-tracker';
import { evaluatePolicyGroups, findMostSpecificOutgoingLimit } from './policy';
import type { RateLimiter } from './rate-limiter';

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
function parsePriceToBaseUnits(
  price: string | null | undefined
): bigint | undefined {
  if (!price) return undefined;

  try {
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return undefined;
    return BigInt(Math.floor(priceNum * 1_000_000));
  } catch {
    return undefined;
  }
}

/**
 * Extracts payment amount from response headers.
 * @param response - HTTP response object
 * @returns Payment amount in base units from X-Price header, or undefined
 */
function extractPaymentAmount(response: Response): bigint | undefined {
  const priceHeader = response.headers.get('X-Price');
  return parsePriceToBaseUnits(priceHeader);
}

/**
 * Extracts recipient address from payment request headers or response.
 * @param request - HTTP request object
 * @param response - HTTP response object
 * @returns Recipient address from X-Pay-To header, or undefined
 */
function extractRecipientAddress(
  request: Request,
  response: Response
): string | undefined {
  const payToHeader = response.headers.get('X-Pay-To');
  if (payToHeader) return payToHeader;
  return undefined;
}

type PaymentInfo = {
  amount: bigint;
  recipientAddress?: string;
  recipientDomain?: string;
};

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
  rateLimiter: RateLimiter
): FetchLike {
  const paymentInfoCache = new Map<string, PaymentInfo>();

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlString = getUrlString(input);
    const targetUrl = urlString;
    const endpointUrl = urlString;
    const targetDomain = extractDomain(urlString);
    const requestKey = `${urlString}:${init?.method || 'GET'}`;

    const response = await baseFetch(input, init);

    if (response.status === 402) {
      const paymentAmount = extractPaymentAmount(response);
      const recipientAddress = extractRecipientAddress(
        input instanceof Request ? input : new Request(input, init),
        response
      );

      if (paymentAmount !== undefined) {
        const evaluation = await evaluatePolicyGroups(
          policyGroups,
          paymentTracker,
          rateLimiter,
          urlString,
          urlString,
          paymentAmount,
          recipientAddress || undefined,
          targetDomain
        );

        if (!evaluation.allowed) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'policy_violation',
                message: evaluation.reason || 'Payment blocked by policy',
                groupName: evaluation.groupName,
              },
            }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
        }

        paymentInfoCache.set(requestKey, {
          amount: paymentAmount,
          recipientAddress: recipientAddress || undefined,
          recipientDomain: targetDomain,
        });
      }
    }

    if (response.ok && response.status >= 200 && response.status < 300) {
      const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE');
      if (paymentResponseHeader) {
        const paymentInfo = paymentInfoCache.get(requestKey);
        if (paymentInfo) {
          for (const group of policyGroups) {
            if (group.outgoingLimits) {
              const limitInfo = findMostSpecificOutgoingLimit(
                group.outgoingLimits,
                targetUrl,
                endpointUrl
              );
              const scope = limitInfo?.scope ?? 'global';

              await paymentTracker.recordOutgoing(
                group.name,
                scope,
                paymentInfo.amount
              );
            }

            if (group.rateLimits) {
              rateLimiter.recordPayment(group.name);
            }
          }

          paymentInfoCache.delete(requestKey);
        }
      }
    }

    return response;
  };
}
