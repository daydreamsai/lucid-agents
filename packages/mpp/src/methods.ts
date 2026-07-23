import type {
  EvmServerConfig,
  LightningServerConfig,
  MppServerMethod,
  StripeServerConfig,
  TempoServerConfig,
  TempoSessionServerConfig,
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
  session: tempoSession,
};

function parseDisplayAmount(
  value: string,
  decimals: number,
  field: string
): bigint {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Tempo session decimals must be a safe integer from 0-255');
  }
  const match = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u.exec(value);
  if (!match?.groups?.whole) {
    throw new Error(`Tempo session ${field} must be a non-negative decimal`);
  }
  const fraction = match.groups.fraction ?? '';
  if (fraction.length > decimals) {
    throw new Error(
      `Tempo session ${field} exceeds configured currency precision`
    );
  }
  return (
    BigInt(match.groups.whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
  );
}

/** Configure a native, TIP-1034 Tempo session method. */
export function tempoSession(
  config: TempoSessionServerConfig
): MppServerMethod {
  const amount = parseDisplayAmount(config.amount, config.decimals, 'amount');
  const minimum = parseDisplayAmount(
    config.deposit.minimum,
    config.decimals,
    'minimum deposit'
  );
  const suggested = parseDisplayAmount(
    config.deposit.suggested,
    config.decimals,
    'suggested deposit'
  );
  const maximum = parseDisplayAmount(
    config.deposit.maximum,
    config.decimals,
    'maximum deposit'
  );
  if (amount <= 0n) {
    throw new Error('Tempo session amount must be greater than zero');
  }
  if (minimum < amount || minimum > suggested || suggested > maximum) {
    throw new Error(
      'Tempo session deposit bounds must satisfy amount <= minimum <= suggested <= maximum'
    );
  }
  if (config.mode === 'production' && config.store?.durability !== 'durable') {
    throw new Error(
      'Tempo session production mode requires durable channel storage'
    );
  }
  if (config.bootstrap && !config.resolveChannelId) {
    throw new Error(
      'Tempo session bootstrap requires a resolveChannelId callback'
    );
  }
  const schedule = config.settlementSchedule;
  if (
    schedule &&
    schedule.units === undefined &&
    schedule.amount === undefined &&
    schedule.intervalMs === undefined
  ) {
    throw new Error(
      'Tempo session settlementSchedule requires at least one threshold'
    );
  }
  if (
    schedule?.units !== undefined &&
    (!Number.isSafeInteger(schedule.units) || schedule.units <= 0)
  ) {
    throw new Error('Tempo session settlement units must be positive');
  }
  if (
    schedule?.intervalMs !== undefined &&
    (!Number.isSafeInteger(schedule.intervalMs) || schedule.intervalMs <= 0)
  ) {
    throw new Error('Tempo session settlement intervalMs must be positive');
  }
  if (
    schedule?.amount !== undefined &&
    parseDisplayAmount(schedule.amount, config.decimals, 'settlement amount') <=
      0n
  ) {
    throw new Error('Tempo session settlement amount must be positive');
  }
  return { name: 'tempo', implementation: 'tempo-session', config };
}

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
 * Configure a native EVM charge method.
 *
 * The same descriptor accepts Payment Authentication `evm/charge`
 * credentials and compatible x402 v2 `exact` credentials. Settlement is
 * configured once, either with an application callback or an x402
 * facilitator.
 */
export function evmServer(config: EvmServerConfig): MppServerMethod {
  return { name: 'evm', implementation: 'evm', config };
}

/** EVM charge server payment-method descriptor. */
export const evm = {
  server: evmServer,
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
