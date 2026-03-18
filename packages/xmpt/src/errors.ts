export type XMPTErrorCode =
  | 'XMPT_PEER_UNREACHABLE'
  | 'XMPT_INBOX_SKILL_MISSING'
  | 'XMPT_INVALID_MESSAGE_PAYLOAD'
  | 'XMPT_TIMEOUT';

export class XMPTError extends Error {
  readonly code: XMPTErrorCode;

  constructor(code: XMPTErrorCode, message: string, cause?: unknown) {
    super(`[${code}] ${message}`, cause ? { cause } : undefined);
    this.name = 'XMPTError';
    this.code = code;
  }
}
