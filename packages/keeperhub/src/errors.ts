export type LandedErrorCode =
  | 'policy_denied'
  | 'preflight_failed'
  | 'execution_failed'
  | 'execution_unconfirmed'
  | 'keeperhub_error'
  | 'not_installed'
  | 'invalid_request';

/**
 * Thrown (never returned) so that Lucid does not finalize the buyer's payment.
 * The code and details are safe to show to the caller.
 */
export class LandedError extends Error {
  readonly code: LandedErrorCode;
  readonly reference: string | undefined;
  readonly details: Record<string, unknown>;

  constructor(
    code: LandedErrorCode,
    message: string,
    options: {
      reference?: string | undefined;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(
      `${code}: ${message}`,
      options.cause !== undefined ? { cause: options.cause } : undefined
    );
    this.name = 'LandedError';
    this.code = code;
    this.reference = options.reference;
    this.details = options.details ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      reference: this.reference,
      ...this.details,
    };
  }
}
