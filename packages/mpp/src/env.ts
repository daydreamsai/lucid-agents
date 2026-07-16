import type {
  MppConfig,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
} from '@lucid-agents/types/mpp';

/**
 * Load MPP configuration from environment variables.
 *
 * Supported env vars:
 * - MPP_METHOD: Payment method ('tempo', 'stripe', 'lightning', or comma-separated)
 * - MPP_CURRENCY: Default currency (default: 'usd')
 * - MPP_DEFAULT_INTENT: Default intent ('charge' or 'session', default: 'charge')
 * - MPP_CHALLENGE_EXPIRY: Challenge expiry in seconds (default: 300)
 * - MPP_SECRET_KEY: HMAC key for built-in mppx challenge verification
 * - MPP_REALM: Payment-Auth realm
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
  const methodNames =
    overrides?.methods?.map(m => m.name) ??
    (process.env.MPP_METHOD ?? 'tempo').split(',').map(s => s.trim());

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

          methods.push({
            name: 'tempo',
            implementation: 'tempo',
            config,
          });
          break;
        }
        case 'stripe': {
          const secretKey =
            process.env.MPP_STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET_KEY;
          const networkId = process.env.MPP_STRIPE_NETWORK_ID;

          if (!secretKey || !networkId) {
            console.warn(
              '[lucid-agents/mpp] Stripe method requires MPP_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY) and MPP_STRIPE_NETWORK_ID env vars'
            );
            break;
          }

          methods.push({
            name: 'stripe',
            implementation: 'stripe',
            config: { secretKey, networkId } as StripeServerConfig,
          });
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

  const currency = overrides?.currency ?? process.env.MPP_CURRENCY ?? 'usd';
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
    ...((overrides?.realm ?? process.env.MPP_REALM)
      ? { realm: overrides?.realm ?? process.env.MPP_REALM }
      : {}),
    ...((overrides?.secretKey ?? process.env.MPP_SECRET_KEY)
      ? { secretKey: overrides?.secretKey ?? process.env.MPP_SECRET_KEY }
      : {}),
    currency,
    defaultIntent,
    challengeExpirySeconds,
    ...(overrides?.verifyCredential
      ? { verifyCredential: overrides.verifyCredential }
      : {}),
    ...(overrides?.session ? { session: overrides.session } : {}),
  };
}
