export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(404, "not_found", message, details);
    this.name = "NotFoundError";
  }
}

export class PaymentRequiredError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(402, "payment_required", message, details);
    this.name = "PaymentRequiredError";
  }
}

export class QuotaExceededError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(429, "quota_exceeded", message, details);
    this.name = "QuotaExceededError";
  }
}

export class StaleDataError extends HttpError {
  constructor(actualAgeSec: number, allowedAgeSec: number) {
    super(
      503,
      "stale_data",
      `Liquidity data is stale: age=${actualAgeSec}s, allowed=${allowedAgeSec}s`,
      { actualAgeSec, allowedAgeSec }
    );
    this.name = "StaleDataError";
  }
}