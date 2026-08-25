import { BASE_CAIP2, BASE_CHAIN_ID, BASE_USDC_ADDRESS } from './constants';
import { UnsafePaymentError } from './errors';
import type { PaymentRequired, X402Accept } from './types';

function bytesFromBase64(value: string): string {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  if (typeof atob === 'function') {
    return atob(padded);
  }
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function decodePaymentRequiredHeader(
  header: string | null
): PaymentRequired | undefined {
  if (!header) return undefined;
  try {
    return JSON.parse(bytesFromBase64(header)) as PaymentRequired;
  } catch {
    try {
      return JSON.parse(header) as PaymentRequired;
    } catch {
      return undefined;
    }
  }
}

export function parsePaymentRequired(
  response: Response,
  body: unknown
): PaymentRequired | undefined {
  const fromHeader =
    decodePaymentRequiredHeader(response.headers.get('PAYMENT-REQUIRED')) ??
    decodePaymentRequiredHeader(response.headers.get('payment-required'));
  if (fromHeader?.accepts?.length) return fromHeader;
  if (body && typeof body === 'object') {
    const record = body as PaymentRequired;
    if (Array.isArray(record.accepts) && record.accepts.length > 0) {
      return record;
    }
    const nested = (body as { paymentRequired?: PaymentRequired })
      .paymentRequired;
    if (nested?.accepts?.length) return nested;
  }
  return fromHeader;
}

export function normalizeNetwork(network: string): string {
  const value = network.trim().toLowerCase();
  if (value === 'base' || value === 'base-mainnet' || value === 'eip155:8453') {
    return BASE_CAIP2;
  }
  return value;
}

export function selectSafeOffer(
  required: PaymentRequired,
  expected: { amount: string; maxSpendBaseUnits: string }
): X402Accept {
  const accepts = required.accepts ?? [];
  if (accepts.length === 0) {
    throw new UnsafePaymentError(
      'missing_payment_requirements',
      '402 response did not include any payment accepts'
    );
  }
  const expectedAmount = BigInt(expected.amount);
  const maxSpend = BigInt(expected.maxSpendBaseUnits);
  const offer = accepts.find(item => {
    try {
      assertSafeOffer(item, expectedAmount, maxSpend);
      return true;
    } catch {
      return false;
    }
  });
  if (!offer) {
    const first = accepts[0];
    assertSafeOffer(first, expectedAmount, maxSpend);
    return first;
  }
  return offer;
}

export function assertSafeOffer(
  offer: X402Accept,
  expectedAmount: bigint,
  maxSpend: bigint
): void {
  const network = normalizeNetwork(offer.network);
  if (network !== BASE_CAIP2) {
    throw new UnsafePaymentError(
      'unsafe_network',
      `Refusing payment on ${offer.network}; Taskmarket requester flow is Base (${BASE_CAIP2}) only`
    );
  }
  if (offer.asset.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()) {
    throw new UnsafePaymentError(
      'unsafe_asset',
      `Refusing payment in ${offer.asset}; canonical Base USDC is ${BASE_USDC_ADDRESS}`
    );
  }
  if (offer.scheme && offer.scheme !== 'exact') {
    throw new UnsafePaymentError(
      'unsafe_scheme',
      `Refusing x402 scheme ${offer.scheme}; only exact is supported`
    );
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(offer.payTo)) {
    throw new UnsafePaymentError(
      'unsafe_pay_to',
      'payTo is not a valid address'
    );
  }
  if (!/^[0-9]+$/.test(offer.amount)) {
    throw new UnsafePaymentError(
      'unsafe_amount',
      'Payment amount is not an integer'
    );
  }
  const amount = BigInt(offer.amount);
  if (amount !== expectedAmount) {
    throw new UnsafePaymentError(
      'amount_mismatch',
      `Payment challenge ${amount} does not match the confirmed amount ${expectedAmount}`
    );
  }
  if (amount > maxSpend) {
    throw new UnsafePaymentError(
      'exceeds_max_spend',
      `Payment challenge ${amount} exceeds max spend ${maxSpend}`
    );
  }
}

export function chainIdFromNetwork(network: string): number {
  const normalized = normalizeNetwork(network);
  if (normalized === BASE_CAIP2) return BASE_CHAIN_ID;
  const match = /^eip155:(\d+)$/.exec(normalized);
  if (!match) {
    throw new UnsafePaymentError(
      'unsafe_network',
      `Unknown network ${network}`
    );
  }
  return Number(match[1]);
}
