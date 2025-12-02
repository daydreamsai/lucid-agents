import type {
  PaymentPolicyGroup,
  SpendingLimit,
  SpendingLimitsConfig,
} from '@lucid-agents/types/payments';
import type { SpendingTracker } from './spending-tracker';
import type { RateLimiter } from './rate-limiter';

/**
 * Result of policy evaluation.
 */
export type PolicyEvaluationResult = {
  allowed: boolean;
  reason?: string;
  groupName?: string;
};

/**
 * Extracts the domain from a URL string.
 * @param url - Full URL (e.g., "https://agent.example.com/entrypoints/process/invoke")
 * @returns Domain (e.g., "agent.example.com") or undefined if URL is invalid
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
 * Normalizes a URL for matching (removes trailing slashes, converts to lowercase).
 * @param url - URL to normalize
 * @returns Normalized URL
 */
function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Evaluates recipient whitelist/blacklist for a policy group.
 * @param group - Policy group to evaluate
 * @param recipientAddress - Recipient address (EVM or Solana)
 * @param recipientDomain - Recipient domain (from URL)
 * @returns Evaluation result
 */
export function evaluateRecipient(
  group: PaymentPolicyGroup,
  recipientAddress?: string,
  recipientDomain?: string
): PolicyEvaluationResult {
  // Check blacklist first (takes precedence)
  if (group.blockedRecipients && group.blockedRecipients.length > 0) {
    for (const blocked of group.blockedRecipients) {
      const normalizedBlocked = normalizeUrl(blocked);

      // Check address match
      if (recipientAddress && normalizeUrl(recipientAddress) === normalizedBlocked) {
        return {
          allowed: false,
          reason: `Recipient address "${recipientAddress}" is blocked by policy group "${group.name}"`,
          groupName: group.name,
        };
      }

      // Check domain match
      if (recipientDomain) {
        const normalizedDomain = normalizeUrl(recipientDomain);
        if (normalizedDomain === normalizedBlocked || normalizedDomain.endsWith(`.${normalizedBlocked}`)) {
          return {
            allowed: false,
            reason: `Recipient domain "${recipientDomain}" is blocked by policy group "${group.name}"`,
            groupName: group.name,
          };
        }
      }
    }
  }

  // Check whitelist (if provided, only whitelisted recipients are allowed)
  if (group.allowedRecipients && group.allowedRecipients.length > 0) {
    let isAllowed = false;

    for (const allowed of group.allowedRecipients) {
      const normalizedAllowed = normalizeUrl(allowed);

      // Check address match
      if (recipientAddress && normalizeUrl(recipientAddress) === normalizedAllowed) {
        isAllowed = true;
        break;
      }

      // Check domain match
      if (recipientDomain) {
        const normalizedDomain = normalizeUrl(recipientDomain);
        if (normalizedDomain === normalizedAllowed || normalizedDomain.endsWith(`.${normalizedAllowed}`)) {
          isAllowed = true;
          break;
        }
      }
    }

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Recipient "${recipientAddress || recipientDomain || 'unknown'}" is not in the whitelist for policy group "${group.name}"`,
        groupName: group.name,
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates rate limit for a policy group.
 * @param group - Policy group to evaluate
 * @param rateLimiter - Rate limiter instance
 * @returns Evaluation result
 */
export function evaluateRateLimit(
  group: PaymentPolicyGroup,
  rateLimiter: RateLimiter
): PolicyEvaluationResult {
  if (!group.rateLimits) {
    return { allowed: true };
  }

  const { maxPayments, windowMs } = group.rateLimits;
  return rateLimiter.checkLimit(group.name, maxPayments, windowMs);
}

/**
 * Finds the most specific spending limit for a given scope.
 * Hierarchy: endpoint > target > global
 * @param limits - Spending limits configuration
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @returns Most specific spending limit or undefined
 */
function findMostSpecificLimit(
  limits: SpendingLimitsConfig,
  targetUrl?: string,
  endpointUrl?: string
): { limit: SpendingLimit; scope: string } | undefined {
  // Check endpoint-level limit first (most specific)
  if (endpointUrl && limits.perEndpoint) {
    const normalizedEndpoint = normalizeUrl(endpointUrl);
    for (const [key, limit] of Object.entries(limits.perEndpoint)) {
      if (normalizeUrl(key) === normalizedEndpoint) {
        return { limit, scope: endpointUrl };
      }
    }
  }

  // Check target-level limit
  if (targetUrl && limits.perTarget) {
    const targetDomain = extractDomain(targetUrl);
    if (targetDomain) {
      const normalizedTarget = normalizeUrl(targetUrl);
      const normalizedDomain = normalizeUrl(targetDomain);

      for (const [key, limit] of Object.entries(limits.perTarget)) {
        const normalizedKey = normalizeUrl(key);
        if (normalizedKey === normalizedTarget || normalizedKey === normalizedDomain) {
          return { limit, scope: normalizedKey };
        }
      }
    }
  }

  // Fall back to global limit
  if (limits.global) {
    return { limit: limits.global, scope: 'global' };
  }

  return undefined;
}

/**
 * Evaluates spending limits for a policy group.
 * Checks both per-request limits (stateless) and total spending limits (stateful).
 * @param group - Policy group to evaluate
 * @param spendingTracker - Spending tracker instance
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @returns Evaluation result
 */
export function evaluateSpendingLimits(
  group: PaymentPolicyGroup,
  spendingTracker: SpendingTracker,
  targetUrl?: string,
  endpointUrl?: string,
  requestedAmount?: bigint
): PolicyEvaluationResult {
  if (!group.spendingLimits || requestedAmount === undefined) {
    return { allowed: true };
  }

  // Find the most specific limit (endpoint > target > global)
  const limitInfo = findMostSpecificLimit(
    group.spendingLimits,
    targetUrl,
    endpointUrl
  );

  if (!limitInfo) {
    return { allowed: true };
  }

  const { limit, scope } = limitInfo;

  // Check per-request limit (stateless)
  if (limit.maxPaymentUsd !== undefined) {
    const maxPaymentBaseUnits = BigInt(Math.floor(limit.maxPaymentUsd * 1_000_000));
    if (requestedAmount > maxPaymentBaseUnits) {
      return {
        allowed: false,
        reason: `Per-request spending limit exceeded for policy group "${group.name}" at scope "${scope}". Requested: ${requestedAmount / 1000000n} USDC, Limit: ${limit.maxPaymentUsd} USDC`,
        groupName: group.name,
      };
    }
  }

  // Check total spending limit (stateful)
  if (limit.maxTotalUsd !== undefined) {
    const checkResult = spendingTracker.checkLimit(
      group.name,
      scope,
      limit.maxTotalUsd,
      limit.windowMs,
      requestedAmount
    );

    if (!checkResult.allowed) {
      return {
        allowed: false,
        reason: checkResult.reason,
        groupName: group.name,
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates all policy groups.
 * All groups must pass - first violation blocks the payment.
 * @param groups - Array of policy groups to evaluate
 * @param spendingTracker - Spending tracker instance
 * @param rateLimiter - Rate limiter instance
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @param recipientAddress - Recipient address (optional)
 * @param recipientDomain - Recipient domain (optional)
 * @returns Evaluation result (first violation blocks)
 */
export function evaluatePolicyGroups(
  groups: PaymentPolicyGroup[],
  spendingTracker: SpendingTracker,
  rateLimiter: RateLimiter,
  targetUrl?: string,
  endpointUrl?: string,
  requestedAmount?: bigint,
  recipientAddress?: string,
  recipientDomain?: string
): PolicyEvaluationResult {
  // Extract domain from target URL if not provided
  if (targetUrl && !recipientDomain) {
    recipientDomain = extractDomain(targetUrl);
  }

  // Evaluate each policy group - all must pass
  for (const group of groups) {
    // Check recipient whitelist/blacklist
    const recipientResult = evaluateRecipient(group, recipientAddress, recipientDomain);
    if (!recipientResult.allowed) {
      return recipientResult;
    }

    // Check spending limits
    const spendingResult = evaluateSpendingLimits(
      group,
      spendingTracker,
      targetUrl,
      endpointUrl,
      requestedAmount
    );
    if (!spendingResult.allowed) {
      return spendingResult;
    }

    // Check rate limits
    const rateResult = evaluateRateLimit(group, rateLimiter);
    if (!rateResult.allowed) {
      return rateResult;
    }
  }

  return { allowed: true };
}

