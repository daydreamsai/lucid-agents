import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import type { SpendingTracker } from './spending-tracker';
import type { RateLimiter } from './rate-limiter';
import { evaluatePolicyGroups } from './policy';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Extracts the URL string from fetch input.
 */
function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Extracts the domain from a URL.
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
 * @param price - Price string (e.g., "1.5" = 1.5 USDC)
 * @returns Amount in base units or undefined if invalid
 */
function parsePriceToBaseUnits(price: string | null | undefined): bigint | undefined {
  if (!price) return undefined;

  try {
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return undefined;
    return BigInt(Math.floor(priceNum * 1_000_000)); // USDC has 6 decimals
  } catch {
    return undefined;
  }
}

/**
 * Extracts payment amount from response headers.
 * Checks X-Price header from payment required response (402).
 */
function extractPaymentAmount(response: Response): bigint | undefined {
  const priceHeader = response.headers.get('X-Price');
  return parsePriceToBaseUnits(priceHeader);
}

/**
 * Extracts recipient address from payment request headers or response.
 */
function extractRecipientAddress(
  request: Request,
  response: Response
): string | undefined {
  // Try X-Pay-To header from response (payment required)
  const payToHeader = response.headers.get('X-Pay-To');
  if (payToHeader) return payToHeader;

  // Could also check request headers if needed
  return undefined;
}

/**
 * Payment tracking info stored during the fetch request lifecycle.
 */
type PaymentInfo = {
  amount: bigint;
  recipientAddress?: string;
  recipientDomain?: string;
};

/**
 * Creates a policy wrapper around the BASE fetch (before x402 wrapper).
 *
 * Flow:
 * 1. Wrap base fetch with policy checking
 * 2. Intercept 402 responses, extract price, check policies
 * 3. If blocked, return error
 * 4. If allowed, pass through to x402 wrapper (which will handle payment)
 * 5. After successful payment, record spending/rate limits
 *
 * This wrapper is applied BEFORE the x402 wrapper so we can intercept
 * the 402 response and check policies before payment happens.
 */
export function wrapBaseFetchWithPolicy(
  baseFetch: FetchLike,
  policyGroups: PaymentPolicyGroup[],
  spendingTracker: SpendingTracker,
  rateLimiter: RateLimiter
): FetchLike {
  // Track payment info per request URL for recording after success
  const paymentInfoCache = new Map<string, PaymentInfo>();

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlString = getUrlString(input);
    const targetDomain = extractDomain(urlString);
    const requestKey = `${urlString}:${init?.method || 'GET'}`;

    // Make the fetch call (this will go to x402 wrapper after)
    const response = await baseFetch(input, init);

    // If we got a 402 payment required response, check policies BEFORE allowing payment
    if (response.status === 402) {
      const paymentAmount = extractPaymentAmount(response);
      const recipientAddress = extractRecipientAddress(
        input instanceof Request ? input : new Request(input, init),
        response
      );

      if (paymentAmount !== undefined) {
        // Evaluate policies BEFORE allowing payment to proceed
        const evaluation = evaluatePolicyGroups(
          policyGroups,
          spendingTracker,
          rateLimiter,
          urlString, // targetUrl
          urlString, // endpointUrl (full URL for now)
          paymentAmount,
          recipientAddress || undefined,
          targetDomain
        );

        if (!evaluation.allowed) {
          // Block the payment - return a policy violation error
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

        // Policies passed - store payment info for recording after successful payment
        paymentInfoCache.set(requestKey, {
          amount: paymentAmount,
          recipientAddress: recipientAddress || undefined,
          recipientDomain: targetDomain,
        });
      }
    }

    // If response is successful (200-299) and we have cached payment info, record it
    if (response.ok && response.status >= 200 && response.status < 300) {
      const paymentInfo = paymentInfoCache.get(requestKey);
      if (paymentInfo) {
        // Check if payment was actually made (x402 wrapper adds this header)
        const paymentResponseHeader = response.headers.get('X-PAYMENT-RESPONSE');
        if (paymentResponseHeader) {
          // Payment was made - record spending and rate limits
          for (const group of policyGroups) {
            // Determine scope - use the URL as scope for now
            const scope = urlString;

            // Record spending if this group has spending limits
            if (group.spendingLimits) {
              spendingTracker.recordSpending(group.name, scope, paymentInfo.amount);
            }

            // Record rate limit if this group has rate limits
            if (group.rateLimits) {
              rateLimiter.recordPayment(group.name);
            }
          }
        }

        // Clean up cached info
        paymentInfoCache.delete(requestKey);
      }
    }

    return response;
  };
}

