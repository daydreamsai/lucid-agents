import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

import { loadPoliciesFromConfig } from './policy-config';

/**
 * Loads payment policy groups from a config file.
 *
 * Example `payment-policies.json`:
 * ```json
 * [
 *   {
 *     "name": "Daily Outgoing Limit",
 *     "outgoingLimits": {
 *       "global": {
 *         "maxPaymentUsd": 10.0,
 *         "maxTotalUsd": 1000.0,
 *         "windowMs": 86400000
 *       },
 *       "perTarget": {
 *         "https://agent.example.com": {
 *           "maxTotalUsd": 500.0
 *         }
 *       },
 *       "perEndpoint": {
 *         "https://agent.example.com/entrypoints/process/invoke": {
 *           "maxTotalUsd": 100.0
 *         }
 *       }
 *     },
 *     "incomingLimits": {
 *       "global": {
 *         "maxTotalUsd": 5000.0
 *       }
 *     },
 *     "allowedRecipients": ["https://trusted.example.com"],
 *     "blockedSenders": ["0x123..."],
 *     "rateLimits": {
 *       "maxPayments": 100,
 *       "windowMs": 3600000
 *     }
 *   }
 * ]
 * ```
 *
 * @param configPath - Optional path to config file (defaults to 'payment-policies.json' in cwd)
 * @returns Array of policy groups or undefined if file doesn't exist
 */
export function policiesFromConfig(
  configPath?: string
): PaymentPolicyGroup[] | undefined {
  return loadPoliciesFromConfig(configPath);
}
