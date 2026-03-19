// Extension
export { mpp, type MppExtensionOptions } from './extension';

// Method builders
export {
  tempo,
  tempoServer,
  tempoClient,
  stripe,
  stripeServer,
  stripeClient,
  lightning,
  lightningServer,
  lightningClient,
  custom,
  customServer,
  customClient,
} from './methods';

// Environment helpers
export { mppFromEnv } from './env';

// Challenge & pricing
export {
  buildChallengeResponse,
  resolveEntrypointPrice,
  resolveEntrypointMppConfig,
  type ChallengeParams,
} from './challenge';

// Manifest
export { buildManifestWithMpp } from './manifest';

// Middleware helpers
export {
  evaluateMppPayment,
  extractMppCredential,
  createReceiptHeader,
  type MppChargeOptions,
  type MppSessionOptions,
} from './middleware';

// Types
export type {
  MppPaymentMethod,
  MppPaymentIntent,
  MppConfig,
  MppClientConfig,
  MppRuntime,
  MppPaymentRequirement,
  MppServerMethod,
  MppClientMethod,
  MppSessionConfig,
  EntrypointMppConfig,
  TempoServerConfig,
  TempoClientConfig,
  StripeServerConfig,
  StripeClientConfig,
  LightningServerConfig,
  LightningClientConfig,
} from './types';
