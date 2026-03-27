export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(404, "NOT_FOUND", message, details);
  }
}

export class PaymentRequiredError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(402, "PAYMENT_REQUIRED", message, details);
  }
}