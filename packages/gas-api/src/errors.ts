export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class StaleDataError extends HttpError {
  constructor(chain: string, ageMs: number, freshnessMs: number) {
    super(
      503,
      "STALE_DATA",
      `Gas data for chain "${chain}" is stale (${ageMs}ms old, max ${freshnessMs}ms).`
    );
  }
}

export function errorBody(error: HttpError): { error: { code: string; message: string } } {
  return {
    error: {
      code: error.code,
      message: error.message
    }
  };
}