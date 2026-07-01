export interface WeatherResponse {
  city: string;
  temp_c: number;
  condition: string;
  humidity: number;
}

export interface PaymentVerificationResult {
  ok: boolean;
  reason?: string;
}