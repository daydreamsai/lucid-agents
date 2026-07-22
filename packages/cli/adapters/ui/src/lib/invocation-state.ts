export type InvocationPhase =
  | 'ready'
  | 'invalid'
  | 'preparing'
  | 'authorization'
  | 'payment'
  | 'network-mismatch'
  | 'running'
  | 'partial'
  | 'success'
  | 'recoverable-error'
  | 'cancelled';

export type InvocationState = {
  phase: InvocationPhase;
  payload: string;
  result?: unknown;
  stream: string[];
  error?: string;
  paymentUsed: boolean;
  taskId?: string;
  taskStatus?: 'running' | 'completed' | 'failed' | 'cancelled';
};

export type InvocationEvent =
  | { type: 'RESET'; payload?: string }
  | { type: 'SET_PAYLOAD'; payload: string }
  | { type: 'INVALID'; error: string }
  | { type: 'PREPARE' }
  | { type: 'REQUIRE_AUTHORIZATION' }
  | { type: 'REQUIRE_PAYMENT' }
  | { type: 'NETWORK_MISMATCH'; error: string }
  | { type: 'START' }
  | { type: 'CHUNK'; chunk: string }
  | { type: 'TASK'; taskId: string; status: InvocationState['taskStatus'] }
  | { type: 'SUCCEED'; result: unknown; paymentUsed?: boolean }
  | { type: 'FAIL'; error: string }
  | { type: 'CANCEL' };

export function createInvocationState(payload = '{}'): InvocationState {
  return {
    phase: 'ready',
    payload,
    stream: [],
    paymentUsed: false,
  };
}

/** Remove authorization material before an error enters visible UI state. */
export function redactInvocationError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/(authorization\s*:\s*)(?:bearer\s+)?[^\s,;]+/giu, '$1[redacted]')
    .replace(
      /((?:signature|credential|access[_-]?token|receipt)\s*[=:]\s*)(?:0x)?[a-z0-9._~-]+/giu,
      '$1[redacted]'
    );
}

export function invocationReducer(
  state: InvocationState,
  event: InvocationEvent
): InvocationState {
  switch (event.type) {
    case 'RESET':
      return createInvocationState(event.payload ?? state.payload);
    case 'SET_PAYLOAD':
      return { ...state, payload: event.payload };
    case 'INVALID':
      return {
        ...createInvocationState(state.payload),
        phase: 'invalid',
        error: redactInvocationError(event.error),
      };
    case 'PREPARE':
      return { ...state, phase: 'preparing', error: undefined };
    case 'REQUIRE_AUTHORIZATION':
      return { ...state, phase: 'authorization', error: undefined };
    case 'REQUIRE_PAYMENT':
      return { ...state, phase: 'payment', error: undefined };
    case 'NETWORK_MISMATCH':
      return {
        ...state,
        phase: 'network-mismatch',
        error: redactInvocationError(event.error),
      };
    case 'START':
      return {
        ...state,
        phase: 'running',
        error: undefined,
        result: undefined,
        stream: [],
        paymentUsed: false,
      };
    case 'CHUNK':
      return {
        ...state,
        phase: 'partial',
        stream: [...state.stream, event.chunk],
      };
    case 'TASK':
      return {
        ...state,
        phase:
          event.status === 'completed'
            ? 'success'
            : event.status === 'cancelled'
              ? 'cancelled'
              : event.status === 'failed'
                ? 'recoverable-error'
                : 'running',
        taskId: event.taskId,
        taskStatus: event.status,
      };
    case 'SUCCEED':
      return {
        ...state,
        phase: 'success',
        result: event.result,
        error: undefined,
        paymentUsed: event.paymentUsed === true,
      };
    case 'FAIL':
      return {
        ...state,
        phase: 'recoverable-error',
        error: redactInvocationError(event.error),
      };
    case 'CANCEL':
      return { ...state, phase: 'cancelled' };
  }
}
