export class TaskmarketError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'TaskmarketError';
    this.code = code;
  }
}

export class AuthorizationRequiredError extends TaskmarketError {
  constructor(message = 'Fresh explicit user authorization is required') {
    super('authorization_required', message);
    this.name = 'AuthorizationRequiredError';
  }
}

export class PreviewMismatchError extends TaskmarketError {
  constructor(message = 'Authorization does not match the issued preview') {
    super('preview_mismatch', message);
    this.name = 'PreviewMismatchError';
  }
}

export class UnsafePaymentError extends TaskmarketError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'UnsafePaymentError';
  }
}

export class PaymentSettlementUnknownError extends TaskmarketError {
  readonly idempotencyKey: string;
  readonly operation: string;

  constructor(idempotencyKey: string, operation: string, message?: string) {
    super(
      'payment_settlement_unknown',
      message ??
        `Payment settlement for ${operation} is unknown. Do not retry with a new payment. Poll GET /api/intents?idempotencyKey=${idempotencyKey}.`
    );
    this.name = 'PaymentSettlementUnknownError';
    this.idempotencyKey = idempotencyKey;
    this.operation = operation;
  }
}

export class PaymentInFlightError extends TaskmarketError {
  readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(
      'payment_in_flight',
      `A payment for idempotency key ${idempotencyKey} is already in flight or unknown. Recover that attempt instead of sending a new payment.`
    );
    this.name = 'PaymentInFlightError';
    this.idempotencyKey = idempotencyKey;
  }
}
