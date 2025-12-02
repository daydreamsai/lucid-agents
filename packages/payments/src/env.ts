import type { PaymentPolicyGroup, SpendingLimitsConfig } from '@lucid-agents/types/payments';

/**
 * Environment variable record type for policy configuration.
 */
type EnvRecord = Record<string, string | undefined>;

/**
 * Parses a comma-separated list from an environment variable.
 */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parses a number from an environment variable.
 */
function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Creates payment policy groups from environment variables.
 *
 * Supports JSON configuration via PAYMENT_POLICY_GROUPS_JSON env var,
 * or individual policy group configuration via env vars with pattern:
 * PAYMENT_POLICY_GROUP_{N}_{KEY}
 *
 * For JSON config, set PAYMENT_POLICY_GROUPS_JSON to a JSON array of policy groups.
 *
 * Example JSON:
 * ```json
 * [
 *   {
 *     "name": "Daily Spending Limit",
 *     "spendingLimits": {
 *       "global": {
 *         "maxPaymentUsd": 10.0,
 *         "maxTotalUsd": 1000.0,
 *         "windowMs": 86400000
 *       }
 *     },
 *     "allowedRecipients": ["https://trusted.example.com"],
 *     "rateLimits": {
 *       "maxPayments": 100,
 *       "windowMs": 3600000
 *     }
 *   }
 * ]
 * ```
 *
 * @param env - Environment variables (defaults to process.env)
 * @returns Array of policy groups or undefined if none configured
 */
export function policiesFromEnv(env: EnvRecord = process.env): PaymentPolicyGroup[] | undefined {
  // Check for JSON configuration first (takes precedence)
  const jsonConfig = env.PAYMENT_POLICY_GROUPS_JSON;
  if (jsonConfig) {
    try {
      const parsed = JSON.parse(jsonConfig) as PaymentPolicyGroup[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn(
        '[payments] Failed to parse PAYMENT_POLICY_GROUPS_JSON:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Try to parse individual policy groups from env vars
  // Pattern: PAYMENT_POLICY_GROUP_{N}_{KEY}
  const groups: PaymentPolicyGroup[] = [];
  const groupIndices = new Set<number>();

  // Find all policy group indices
  for (const key of Object.keys(env)) {
    const match = key.match(/^PAYMENT_POLICY_GROUP_(\d+)_NAME$/i);
    if (match) {
      const index = parseInt(match[1]!, 10);
      if (!Number.isNaN(index)) {
        groupIndices.add(index);
      }
    }
  }

  // Build policy groups from env vars
  for (const index of groupIndices) {
    const nameKey = `PAYMENT_POLICY_GROUP_${index}_NAME`;
    const name = env[nameKey];
    if (!name) continue;

    const group: PaymentPolicyGroup = { name };

    // Parse spending limits
    const maxPaymentUsd = parseNumber(env[`PAYMENT_POLICY_GROUP_${index}_GLOBAL_MAX_PAYMENT_USD`]);
    const maxTotalUsd = parseNumber(env[`PAYMENT_POLICY_GROUP_${index}_GLOBAL_MAX_TOTAL_USD`]);
    const windowMs = parseNumber(env[`PAYMENT_POLICY_GROUP_${index}_GLOBAL_WINDOW_MS`]);

    if (maxPaymentUsd !== undefined || maxTotalUsd !== undefined) {
      group.spendingLimits = {
        global: {},
      };
      if (maxPaymentUsd !== undefined) {
        group.spendingLimits.global!.maxPaymentUsd = maxPaymentUsd;
      }
      if (maxTotalUsd !== undefined) {
        group.spendingLimits.global!.maxTotalUsd = maxTotalUsd;
      }
      if (windowMs !== undefined) {
        group.spendingLimits.global!.windowMs = windowMs;
      }
    }

    // Parse whitelist/blacklist
    const allowedRecipients = parseList(env[`PAYMENT_POLICY_GROUP_${index}_ALLOWED_RECIPIENTS`]);
    if (allowedRecipients.length > 0) {
      group.allowedRecipients = allowedRecipients;
    }

    const blockedRecipients = parseList(env[`PAYMENT_POLICY_GROUP_${index}_BLOCKED_RECIPIENTS`]);
    if (blockedRecipients.length > 0) {
      group.blockedRecipients = blockedRecipients;
    }

    // Parse rate limits
    const maxPayments = parseNumber(env[`PAYMENT_POLICY_GROUP_${index}_RATE_LIMIT_COUNT`]);
    const rateWindowMs = parseNumber(env[`PAYMENT_POLICY_GROUP_${index}_RATE_LIMIT_WINDOW_MS`]);

    if (maxPayments !== undefined && rateWindowMs !== undefined) {
      group.rateLimits = {
        maxPayments,
        windowMs: rateWindowMs,
      };
    }

    groups.push(group);
  }

  return groups.length > 0 ? groups : undefined;
}

