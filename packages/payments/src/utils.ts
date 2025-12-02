import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { policiesFromEnv } from './env';

/**
 * Creates PaymentsConfig from environment variables and optional overrides.
 *
 * @param configOverrides - Optional config overrides from agent-kit config
 * @returns PaymentsConfig resolved from env + overrides
 */
export function paymentsFromEnv(configOverrides?: Partial<PaymentsConfig>): PaymentsConfig {
  const baseConfig: PaymentsConfig = {
    payTo: configOverrides?.payTo ?? (process.env.PAYMENTS_RECEIVABLE_ADDRESS as any),
    facilitatorUrl: configOverrides?.facilitatorUrl ?? (process.env.FACILITATOR_URL as any),
    network: configOverrides?.network ?? (process.env.NETWORK as any),
  };

  // Add policy groups from environment if not overridden
  if (!configOverrides?.policyGroups) {
    const envPolicies = policiesFromEnv();
    if (envPolicies) {
      baseConfig.policyGroups = envPolicies;
    }
  }

  // Merge with overrides (policy groups from overrides take precedence)
  return {
    ...baseConfig,
    ...configOverrides,
  };
}

