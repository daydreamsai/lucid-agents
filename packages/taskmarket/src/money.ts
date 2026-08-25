import { USDC_DECIMALS } from './constants';
import { TaskmarketError } from './errors';

export function parseBaseUnits(value: bigint | string | number): bigint {
  if (typeof value === 'bigint') {
    if (value <= 0n) {
      throw new TaskmarketError(
        'invalid_amount',
        'Amount must be greater than zero'
      );
    }
    return value;
  }
  const asString = String(value).trim();
  if (!/^[0-9]+$/.test(asString) || asString === '0') {
    throw new TaskmarketError(
      'invalid_amount',
      'Amount must be a positive integer in USDC base units'
    );
  }
  return BigInt(asString);
}

export function parseUsdcToBaseUnits(value: number | string): bigint {
  const asString = String(value).trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(asString)) {
    throw new TaskmarketError(
      'invalid_amount',
      'USDC amount must have at most 6 decimal places'
    );
  }
  const [whole, fraction = ''] = asString.split('.');
  const padded = (fraction + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const base =
    BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(padded || '0');
  if (base <= 0n) {
    throw new TaskmarketError(
      'invalid_amount',
      'Amount must be greater than zero'
    );
  }
  return base;
}

export function formatUsdc(baseUnits: bigint | string): string {
  const value = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 10n ** BigInt(USDC_DECIMALS);
  const frac = (abs % 10n ** BigInt(USDC_DECIMALS))
    .toString()
    .padStart(USDC_DECIMALS, '0')
    .replace(/0+$/, '');
  const rendered = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${rendered}` : rendered;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
    .join(',')}}`;
}
