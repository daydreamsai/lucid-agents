import type { MppConfig, MppServerMethod, TempoServerConfig, StripeServerConfig } from './types';

/**
 * Load MPP configuration from environment variables.
 *
 * Supported env vars:
 * - MPP_METHOD: Payment method ('tempo', 'stripe', 'lightning', or comma-separated)
 * - MPP_CURRENCY: Default currency (default: 'usd')
 * - MPP_DEFAULT_INTENT: Default intent ('charge' or 'session', default: 'charge')
 * - MPP_CHALLENGE_EXPIRY: Challenge expiry in seconds (default: 300)
 *
 * Tempo-specific:
 * - MPP_TEMPO_CURRENCY: Token address for Tempo
 * - MPP_TEMPO_RECIPIENT: Recipient wallet address
 * - MPP_TEMPO_CHAIN_ID: Chain ID for Tempo network
 *
 * Stripe-specific:
 * - MPP_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY: Stripe secret key
 *
 * @param overrides - Optional config overrides
 */
export function mppFromEnv(overrides?: Partial<MppConfig>): MppConfig {
  const methodNames = (
    overrides?.methods?.map(m => m.name) ??
    (process.env.MPP_METHOD ?? 'tempo').split(',').map(s => s.trim())
  );

  const methods: MppServerMethod[] = overrides?.methods ?? [];

  if (methods.length === 0) {
    for (const name of methodNames) {
      switch (name) {
        case 'tempo': {
          const currency = process.env.MPP_TEMPO_CURRENCY;
          const recipient =
            process.env.MPP_TEMPO_RECIPIENT ??
            process.env.PAYMENTS_RECEIVABLE_ADDRESS;

          if (!currency || !recipient) {
            console.warn(
              '[lucid-agents/mpp] Tempo method requires MPP_TEMPO_CURRENCY and MPP_TEMPO_RECIPIENT env vars'
            );
            break;
          }

          const config: TempoServerConfig = {
            currency,
            recipient,
          };

          const chainId = process.env.MPP_TEMPO_CHAIN_ID;
          if (chainId) config.chainId = parseInt(chainId, 10);

          methods.push({ name: 'tempo', config });
          break;
        }
        case 'stripe': {
          const secretKey =
            process.env.MPP_STRIPE_SECRET_KEY ??
            process.env.STRIPE_SECRET_KEY;

          if (!secretKey) {
            console.warn(
              '[lucid-agents/mpp] Stripe method requires MPP_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY env var'
            );
            break;
          }

          const config: StripeServerConfig = {
            client: null, // Will be initialized lazily
          };

          methods.push({ name: 'stripe', config });
          break;
        }
        default: {
          console.warn(
            `[lucid-agents/mpp] Unknown payment method "${name}" from env. Use custom() to configure.`
          );
        }
      }
    }
  }

  const currency =
    overrides?.currency ?? process.env.MPP_CURRENCY ?? 'usd';
  const defaultIntent =
    overrides?.defaultIntent ??
    (process.env.MPP_DEFAULT_INTENT as 'charge' | 'session' | undefined) ??
    'charge';
  const challengeExpirySeconds =
    overrides?.challengeExpirySeconds ??
    (process.env.MPP_CHALLENGE_EXPIRY
      ? parseInt(process.env.MPP_CHALLENGE_EXPIRY, 10)
      : 300);

  return {
    methods,
    currency,
    defaultIntent,
    challengeExpirySeconds,
    ...overrides,
  };
}
