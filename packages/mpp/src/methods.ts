import type {
  MppServerMethod,
  MppClientMethod,
  TempoServerConfig,
  TempoClientConfig,
  StripeServerConfig,
  StripeClientConfig,
  LightningServerConfig,
  LightningClientConfig,
} from './types';

// ─── Server-side method builders ─────────────────────────────────

/**
 * Configure Tempo stablecoin payment method (server-side).
 *
 * @example
 * ```ts
 * import { tempo } from '@lucid-agents/mpp';
 *
 * const method = tempo.server({
 *   currency: '0x20c0000000000000000000000000000000000000', // pathUSD
 *   recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
 * });
 * ```
 */
export function tempoServer(config: TempoServerConfig): MppServerMethod {
  return { name: 'tempo', config };
}

/**
 * Configure Tempo stablecoin payment method (client-side).
 *
 * @example
 * ```ts
 * import { tempo } from '@lucid-agents/mpp';
 *
 * const method = tempo.client({
 *   account: privateKeyToAccount('0x...'),
 * });
 * ```
 */
export function tempoClient(config: TempoClientConfig): MppClientMethod {
  return { name: 'tempo', config };
}

/**
 * Tempo payment method namespace with server/client builders.
 */
export const tempo = {
  server: tempoServer,
  client: tempoClient,
};

/**
 * Configure Stripe payment method (server-side).
 */
export function stripeServer(config: StripeServerConfig): MppServerMethod {
  return { name: 'stripe', config };
}

/**
 * Configure Stripe payment method (client-side).
 */
export function stripeClient(config: StripeClientConfig): MppClientMethod {
  return { name: 'stripe', config };
}

/**
 * Stripe payment method namespace with server/client builders.
 */
export const stripe = {
  server: stripeServer,
  client: stripeClient,
};

/**
 * Configure Lightning payment method (server-side).
 */
export function lightningServer(config: LightningServerConfig): MppServerMethod {
  return { name: 'lightning', config };
}

/**
 * Configure Lightning payment method (client-side).
 */
export function lightningClient(config: LightningClientConfig): MppClientMethod {
  return { name: 'lightning', config };
}

/**
 * Lightning payment method namespace with server/client builders.
 */
export const lightning = {
  server: lightningServer,
  client: lightningClient,
};

/**
 * Create a custom payment method (server-side).
 */
export function customServer(name: string, config: Record<string, unknown>): MppServerMethod {
  return { name, config };
}

/**
 * Create a custom payment method (client-side).
 */
export function customClient(name: string, config: Record<string, unknown>): MppClientMethod {
  return { name, config };
}

/**
 * Custom payment method namespace with server/client builders.
 */
export const custom = {
  server: customServer,
  client: customClient,
};
