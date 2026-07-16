import type {
  LightningServerConfig,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
} from '@lucid-agents/types/mpp';

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
  return { name: 'tempo', implementation: 'tempo', config };
}

/** Tempo server payment-method descriptor. */
export const tempo = {
  server: tempoServer,
};

/**
 * Configure Stripe payment method (server-side).
 */
export function stripeServer(config: StripeServerConfig): MppServerMethod {
  return { name: 'stripe', implementation: 'stripe', config };
}

/** Stripe server payment-method descriptor. */
export const stripe = {
  server: stripeServer,
};

/**
 * Configure Lightning payment method (server-side).
 */
export function lightningServer(
  config: LightningServerConfig
): MppServerMethod {
  return { name: 'lightning', implementation: 'custom', config };
}

/** Lightning server payment-method descriptor. */
export const lightning = {
  server: lightningServer,
};

/**
 * Create a custom payment method (server-side).
 */
export function customServer(
  name: string,
  config: Record<string, unknown>
): MppServerMethod {
  return { name, implementation: 'custom', config };
}

/** Custom server payment-method descriptor. */
export const custom = {
  server: customServer,
};
