import type {
  PaymentPolicyGroup,
  OutgoingLimit,
  OutgoingLimitsConfig,
  IncomingLimit,
  IncomingLimitsConfig,
} from '@lucid-agents/types/payments';
import type { PaymentTracker } from './payment-tracker';
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
 * Formats a BigInt amount (in base units with 6 decimals) to a human-friendly USDC string.
 * @param amount - Amount in base units (USDC has 6 decimals)
 * @returns Formatted string (e.g., "1.5" for 1.5 USDC, "1" for 1.0 USDC)
 */
function formatUsdcAmount(amount: bigint): string {
  const usdc = Number(amount) / 1_000_000;
  return usdc.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Extracts domain from a URL string or returns the input if it's already a domain.
 * Handles both full URLs (https://example.com) and plain domains (example.com).
 * @param urlOrDomain - URL string or domain
 * @returns Domain string (lowercase, normalized)
 */
function extractDomainFromUrlOrDomain(urlOrDomain: string): string {
  const domain = extractDomain(urlOrDomain);
  if (domain) {
    return domain.toLowerCase();
  }
  return normalizeUrl(urlOrDomain);
}

/**
 * Checks if two domains match (exact match or subdomain).
 * @param domain1 - First domain (already normalized)
 * @param domain2 - Second domain (already normalized)
 * @returns True if domains match
 */
function domainsMatch(domain1: string, domain2: string): boolean {
  const normalized1 = normalizeUrl(domain1);
  const normalized2 = normalizeUrl(domain2);

  if (normalized1 === normalized2) {
    return true;
  }

  if (normalized1.endsWith(`.${normalized2}`)) {
    return true;
  }

  return false;
}

/**
 * Evaluates sender whitelist/blacklist for a policy group (incoming payments).
 * Similar to evaluateRecipient but for incoming payments.
 * @param group - Policy group to evaluate
 * @param senderAddress - Sender address (EVM or Solana)
 * @param senderDomain - Sender domain (from URL)
 * @returns Evaluation result
 */
export function evaluateSender(
  group: PaymentPolicyGroup,
  senderAddress?: string,
  senderDomain?: string
): PolicyEvaluationResult {
  if (group.blockedSenders && group.blockedSenders.length > 0) {
    for (const blocked of group.blockedSenders) {
      const blockedDomain = extractDomainFromUrlOrDomain(blocked);
      const normalizedBlocked = normalizeUrl(blocked);

      if (senderAddress && normalizeUrl(senderAddress) === normalizedBlocked) {
        return {
          allowed: false,
          reason: `Sender address "${senderAddress}" is blocked by policy group "${group.name}"`,
          groupName: group.name,
        };
      }

      if (senderDomain) {
        const normalizedDomain = normalizeUrl(senderDomain);
        if (domainsMatch(normalizedDomain, blockedDomain)) {
          return {
            allowed: false,
            reason: `Sender domain "${senderDomain}" is blocked by policy group "${group.name}"`,
            groupName: group.name,
          };
        }
      }
    }
  }

  if (group.allowedSenders && group.allowedSenders.length > 0) {
    let isAllowed = false;

    for (const allowed of group.allowedSenders) {
      const allowedDomain = extractDomainFromUrlOrDomain(allowed);
      const normalizedAllowed = normalizeUrl(allowed);

      if (senderAddress && normalizeUrl(senderAddress) === normalizedAllowed) {
        isAllowed = true;
        break;
      }

      if (senderDomain) {
        const normalizedDomain = normalizeUrl(senderDomain);
        if (domainsMatch(normalizedDomain, allowedDomain)) {
          isAllowed = true;
          break;
        }
      }
    }

    if (!isAllowed) {
      return {
        allowed: false,
        reason: `Sender "${senderAddress || senderDomain || 'unknown'}" is not in the whitelist for policy group "${group.name}"`,
        groupName: group.name,
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluates recipient whitelist/blacklist for a policy group (outgoing payments).
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
  if (group.blockedRecipients && group.blockedRecipients.length > 0) {
    for (const blocked of group.blockedRecipients) {
      const blockedDomain = extractDomainFromUrlOrDomain(blocked);
      const normalizedBlocked = normalizeUrl(blocked);

      if (
        recipientAddress &&
        normalizeUrl(recipientAddress) === normalizedBlocked
      ) {
        return {
          allowed: false,
          reason: `Recipient address "${recipientAddress}" is blocked by policy group "${group.name}"`,
          groupName: group.name,
        };
      }

      if (recipientDomain) {
        const normalizedDomain = normalizeUrl(recipientDomain);
        if (domainsMatch(normalizedDomain, blockedDomain)) {
          return {
            allowed: false,
            reason: `Recipient domain "${recipientDomain}" is blocked by policy group "${group.name}"`,
            groupName: group.name,
          };
        }
      }
    }
  }

  if (group.allowedRecipients && group.allowedRecipients.length > 0) {
    let isAllowed = false;

    for (const allowed of group.allowedRecipients) {
      const allowedDomain = extractDomainFromUrlOrDomain(allowed);
      const normalizedAllowed = normalizeUrl(allowed);

      if (
        recipientAddress &&
        normalizeUrl(recipientAddress) === normalizedAllowed
      ) {
        isAllowed = true;
        break;
      }

      if (recipientDomain) {
        const normalizedDomain = normalizeUrl(recipientDomain);
        if (domainsMatch(normalizedDomain, allowedDomain)) {
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
 * Finds the most specific outgoing limit for a given scope.
 * Hierarchy: endpoint > target > global
 * @param limits - Outgoing limits configuration
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @returns Most specific outgoing limit with resolved scope, or undefined
 */
export function findMostSpecificOutgoingLimit(
  limits: OutgoingLimitsConfig,
  targetUrl?: string,
  endpointUrl?: string
): { limit: OutgoingLimit; scope: string } | undefined {
  if (endpointUrl && limits.perEndpoint) {
    const normalizedEndpoint = normalizeUrl(endpointUrl);
    for (const [key, limit] of Object.entries(limits.perEndpoint)) {
      if (normalizeUrl(key) === normalizedEndpoint) {
        return { limit, scope: endpointUrl };
      }
    }
  }

  if (targetUrl && limits.perTarget) {
    const targetDomain = extractDomain(targetUrl);
    if (targetDomain) {
      const normalizedTarget = normalizeUrl(targetUrl);
      const normalizedDomain = normalizeUrl(targetDomain);

      for (const [key, limit] of Object.entries(limits.perTarget)) {
        const normalizedKey = normalizeUrl(key);
        const keyDomain = extractDomain(key);
        const normalizedKeyDomain = keyDomain
          ? normalizeUrl(keyDomain)
          : undefined;

        if (
          normalizedKey === normalizedTarget ||
          normalizedKey === normalizedDomain ||
          (normalizedKeyDomain && normalizedKeyDomain === normalizedDomain) ||
          (keyDomain && normalizeUrl(keyDomain) === normalizedDomain)
        ) {
          return { limit, scope: normalizedKey };
        }
      }
    }
  }

  if (limits.global) {
    return { limit: limits.global, scope: 'global' };
  }

  return undefined;
}

/**
 * Finds the most specific incoming limit for a given scope.
 * Hierarchy: endpoint > sender > global
 * @param limits - Incoming limits configuration
 * @param senderAddress - Sender address (optional)
 * @param senderDomain - Sender domain (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @returns Most specific incoming limit with resolved scope, or undefined
 */
export function findMostSpecificIncomingLimit(
  limits: IncomingLimitsConfig,
  senderAddress?: string,
  senderDomain?: string,
  endpointUrl?: string
): { limit: IncomingLimit; scope: string } | undefined {
  if (endpointUrl && limits.perEndpoint) {
    const normalizedEndpoint = normalizeUrl(endpointUrl);
    for (const [key, limit] of Object.entries(limits.perEndpoint)) {
      if (normalizeUrl(key) === normalizedEndpoint) {
        return { limit, scope: endpointUrl };
      }
    }
  }

  if (senderAddress && limits.perSender) {
    const normalizedSender = normalizeUrl(senderAddress);
    for (const [key, limit] of Object.entries(limits.perSender)) {
      if (normalizeUrl(key) === normalizedSender) {
        return { limit, scope: key };
      }
    }
  }

  if (senderDomain && limits.perSender) {
    const normalizedDomain = normalizeUrl(senderDomain);
    for (const [key, limit] of Object.entries(limits.perSender)) {
      const keyDomain = extractDomain(key);
      if (keyDomain && normalizeUrl(keyDomain) === normalizedDomain) {
        return { limit, scope: key };
      }
    }
  }

  if (limits.global) {
    return { limit: limits.global, scope: 'global' };
  }

  return undefined;
}

/**
 * Evaluates outgoing payment limits for a policy group.
 * Checks both per-request limits (stateless) and total outgoing limits (stateful).
 * @param group - Policy group to evaluate
 * @param paymentTracker - Payment tracker instance
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @returns Evaluation result
 */
export async function evaluateOutgoingLimits(
  group: PaymentPolicyGroup,
  paymentTracker: PaymentTracker,
  targetUrl?: string,
  endpointUrl?: string,
  requestedAmount?: bigint
): Promise<PolicyEvaluationResult> {
  if (!group.outgoingLimits || requestedAmount === undefined) {
    return { allowed: true };
  }

  const limitInfo = findMostSpecificOutgoingLimit(
    group.outgoingLimits,
    targetUrl,
    endpointUrl
  );

  if (!limitInfo) {
    return { allowed: true };
  }

  const { limit, scope } = limitInfo;

  if (limit.maxPaymentUsd !== undefined) {
    const maxPaymentBaseUnits = BigInt(
      Math.floor(limit.maxPaymentUsd * 1_000_000)
    );
    if (requestedAmount > maxPaymentBaseUnits) {
      return {
        allowed: false,
        reason: `Per-request outgoing limit exceeded for policy group "${group.name}" at scope "${scope}". Requested: ${formatUsdcAmount(requestedAmount)} USDC, Limit: ${limit.maxPaymentUsd} USDC`,
        groupName: group.name,
      };
    }
  }

  if (limit.maxTotalUsd !== undefined) {
    const checkResult = await paymentTracker.checkOutgoingLimit(
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
 * Evaluates incoming payment limits for a policy group.
 * Checks both per-request limits (stateless) and total incoming limits (stateful).
 * @param group - Policy group to evaluate
 * @param paymentTracker - Payment tracker instance
 * @param senderAddress - Sender address (optional)
 * @param senderDomain - Sender domain (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @returns Evaluation result
 */
export async function evaluateIncomingLimits(
  group: PaymentPolicyGroup,
  paymentTracker: PaymentTracker,
  senderAddress?: string,
  senderDomain?: string,
  endpointUrl?: string,
  requestedAmount?: bigint
): Promise<PolicyEvaluationResult> {
  if (!group.incomingLimits || requestedAmount === undefined) {
    return { allowed: true };
  }

  const limitInfo = findMostSpecificIncomingLimit(
    group.incomingLimits,
    senderAddress,
    senderDomain,
    endpointUrl
  );

  if (!limitInfo) {
    return { allowed: true };
  }

  const { limit, scope } = limitInfo;

  if (limit.maxPaymentUsd !== undefined) {
    const maxPaymentBaseUnits = BigInt(
      Math.floor(limit.maxPaymentUsd * 1_000_000)
    );
    if (requestedAmount > maxPaymentBaseUnits) {
      return {
        allowed: false,
        reason: `Per-request incoming limit exceeded for policy group "${group.name}" at scope "${scope}". Requested: ${formatUsdcAmount(requestedAmount)} USDC, Limit: ${limit.maxPaymentUsd} USDC`,
        groupName: group.name,
      };
    }
  }

  if (limit.maxTotalUsd !== undefined) {
    const checkResult = await paymentTracker.checkIncomingLimit(
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
 * Evaluates all policy groups for outgoing payments.
 * All groups must pass - first violation blocks the payment.
 * @param groups - Array of policy groups to evaluate
 * @param paymentTracker - Payment tracker instance
 * @param rateLimiter - Rate limiter instance
 * @param targetUrl - Target agent URL (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @param recipientAddress - Recipient address (optional)
 * @param recipientDomain - Recipient domain (optional)
 * @returns Evaluation result (first violation blocks)
 */
export async function evaluatePolicyGroups(
  groups: PaymentPolicyGroup[],
  paymentTracker: PaymentTracker,
  rateLimiter: RateLimiter,
  targetUrl?: string,
  endpointUrl?: string,
  requestedAmount?: bigint,
  recipientAddress?: string,
  recipientDomain?: string
): Promise<PolicyEvaluationResult> {
  if (targetUrl && !recipientDomain) {
    recipientDomain = extractDomain(targetUrl);
  }

  for (const group of groups) {
    const recipientResult = evaluateRecipient(
      group,
      recipientAddress,
      recipientDomain
    );
    if (!recipientResult.allowed) {
      return recipientResult;
    }

    const outgoingResult = await evaluateOutgoingLimits(
      group,
      paymentTracker,
      targetUrl,
      endpointUrl,
      requestedAmount
    );
    if (!outgoingResult.allowed) {
      return outgoingResult;
    }

    const rateResult = evaluateRateLimit(group, rateLimiter);
    if (!rateResult.allowed) {
      return rateResult;
    }
  }

  return { allowed: true };
}

/**
 * Evaluates all policy groups for incoming payments.
 * All groups must pass - first violation blocks the service (payment already received).
 * @param groups - Array of policy groups to evaluate
 * @param paymentTracker - Payment tracker instance
 * @param senderAddress - Sender address (optional)
 * @param senderDomain - Sender domain (optional)
 * @param endpointUrl - Full endpoint URL (optional)
 * @param requestedAmount - Requested payment amount in base units
 * @returns Evaluation result (first violation blocks)
 */
export async function evaluateIncomingPolicyGroups(
  groups: PaymentPolicyGroup[],
  paymentTracker: PaymentTracker,
  senderAddress?: string,
  senderDomain?: string,
  endpointUrl?: string,
  requestedAmount?: bigint
): Promise<PolicyEvaluationResult> {
  for (const group of groups) {
    const senderResult = evaluateSender(group, senderAddress, senderDomain);
    if (!senderResult.allowed) {
      return senderResult;
    }

    const incomingResult = await evaluateIncomingLimits(
      group,
      paymentTracker,
      senderAddress,
      senderDomain,
      endpointUrl,
      requestedAmount
    );
    if (!incomingResult.allowed) {
      return incomingResult;
    }
  }

  return { allowed: true };
}
