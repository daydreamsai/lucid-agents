import type { PaymentTracker } from '@lucid-agents/payments';
import type { PaymentRecord } from '@lucid-agents/types/payments';
import type {
  AnalyticsSummary,
  Transaction,
  AnalyticsData,
} from '@lucid-agents/types/analytics';

/**
 * Formats a BigInt amount (in base units with 6 decimals) to a human-friendly USDC string.
 */
function formatUsdcAmount(amount: bigint): string {
  const usdc = Number(amount) / 1_000_000;
  return usdc.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Gets outgoing payment summary for a time window.
 */
export async function getOutgoingSummary(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<AnalyticsSummary> {
  const allRecords = await paymentTracker.getAllData();
  const cutoff = windowMs !== undefined ? Date.now() - windowMs : undefined;

  const filtered = cutoff
    ? allRecords.filter(r => r.timestamp > cutoff)
    : allRecords;

  const outgoing = filtered.filter(r => r.direction === 'outgoing');
  const incoming = filtered.filter(r => r.direction === 'incoming');

  const outgoingTotal = outgoing.reduce((sum, r) => sum + r.amount, 0n);
  const incomingTotal = incoming.reduce((sum, r) => sum + r.amount, 0n);

  return {
    outgoingTotal,
    incomingTotal,
    netTotal: incomingTotal - outgoingTotal,
    outgoingCount: outgoing.length,
    incomingCount: incoming.length,
    windowStart: cutoff,
    windowEnd: Date.now(),
  };
}

/**
 * Gets incoming payment summary for a time window.
 */
export async function getIncomingSummary(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<AnalyticsSummary> {
  return await getOutgoingSummary(paymentTracker, windowMs);
}

/**
 * Gets combined summary (outgoing + incoming) for a time window.
 */
export async function getSummary(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<AnalyticsSummary> {
  return await getOutgoingSummary(paymentTracker, windowMs);
}

/**
 * Gets all transactions for a time window.
 */
export async function getAllTransactions(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<Transaction[]> {
  const allRecords = await paymentTracker.getAllData();
  const cutoff = windowMs !== undefined ? Date.now() - windowMs : undefined;

  const filtered = cutoff
    ? allRecords.filter(r => r.timestamp > cutoff)
    : allRecords;

  return filtered
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(record => ({
      ...record,
      amountUsdc: formatUsdcAmount(record.amount),
      timestampIso: new Date(record.timestamp).toISOString(),
    }));
}

/**
 * Gets full analytics data (summary + transactions).
 */
export async function getAnalyticsData(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<AnalyticsData> {
  return {
    summary: await getSummary(paymentTracker, windowMs),
    transactions: await getAllTransactions(paymentTracker, windowMs),
  };
}

/**
 * Exports analytics data to CSV format.
 */
export async function exportToCSV(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<string> {
  const transactions = await getAllTransactions(paymentTracker, windowMs);

  const headers = [
    'id',
    'groupName',
    'scope',
    'direction',
    'amountUsdc',
    'timestamp',
    'timestampIso',
  ].join(',');

  const rows = transactions.map(t => {
    return [
      t.id ?? '',
      t.groupName,
      t.scope,
      t.direction,
      t.amountUsdc,
      t.timestamp.toString(),
      t.timestampIso,
    ].join(',');
  });

  return [headers, ...rows].join('\n');
}

/**
 * Exports analytics data to JSON format.
 */
export async function exportToJSON(
  paymentTracker: PaymentTracker,
  windowMs?: number
): Promise<string> {
  const data = await getAnalyticsData(paymentTracker, windowMs);
  return JSON.stringify(
    data,
    (key, value) => {
      // Convert bigint to string for JSON serialization
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    },
    2
  );
}
