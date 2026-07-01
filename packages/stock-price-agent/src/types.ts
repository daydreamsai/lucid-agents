export interface StockQuoteResponse {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  timestamp: string;
}

export interface PaymentVerificationResult {
  ok: boolean;
  headers: Record<string, string>;
  message?: string;
}