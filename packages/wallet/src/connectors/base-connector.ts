import type {
  AgentChallengeResponse,
  ChallengeSigner,
  WalletConnector,
  WalletMetadata,
} from '@lucid-agents/types/wallets';

export interface NormalizedChallenge {
  id: string;
  credentialId: string | null;
  payload: unknown;
  payloadHash: string | null;
  nonce: string;
  scopes: string[];
  issuedAt: Date;
  expiresAt: Date;
  serverSignature: string | null;
  message: string | null;
}

export const normalizeChallenge = (
  challenge: AgentChallengeResponse['challenge']
): NormalizedChallenge => {
  const issuedAt = toDate(challenge.issued_at);
  const expiresAt = toDate(challenge.expires_at);

  const scopes = Array.isArray(challenge.scopes)
    ? challenge.scopes.filter(
        (value): value is string => typeof value === 'string'
      )
    : [];

  return {
    id: challenge.id,
    credentialId: challenge.credential_id ?? null,
    payload: challenge.payload,
    payloadHash: challenge.payload_hash ?? null,
    nonce: challenge.nonce,
    scopes,
    issuedAt,
    expiresAt,
    serverSignature: challenge.server_signature ?? null,
    message: resolveChallengeMessage(challenge.payload),
  };
};

const toDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value);

const resolveChallengeMessage = (payload: unknown): string | null => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.message === 'string') {
    return record.message;
  }

  if (typeof record.payload === 'string') {
    return record.payload;
  }

  if (Array.isArray(record.parts)) {
    const joined = record.parts
      .map(item =>
        typeof item === 'string'
          ? item
          : typeof item === 'object' && item && 'text' in item
            ? String((item as { text: unknown }).text ?? '')
            : ''
      )
      .join('');
    if (joined) {
      return joined;
    }
  }

  // No signable message found - return null to trigger error
  return null;
};

export const extractSignature = (payload: unknown): string | null => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const signed = record.signed ?? record.signature ?? payload;

  if (typeof signed === 'string') {
    return signed;
  }

  if (
    signed &&
    typeof signed === 'object' &&
    'signature' in signed &&
    typeof (signed as { signature: unknown }).signature === 'string'
  ) {
    return (signed as { signature: string }).signature;
  }

  return null;
};

export const extractWalletMetadata = (
  payload: unknown
): WalletMetadata | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (!record.wallet || typeof record.wallet !== 'object') {
    return null;
  }

  const wallet = record.wallet as Record<string, unknown>;
  const account =
    record.account && typeof record.account === 'object'
      ? (record.account as Record<string, unknown>)
      : undefined;

  return {
    id: typeof wallet.id === 'string' ? wallet.id : null,
    address: typeof wallet.address === 'string' ? wallet.address : null,
    chain: typeof wallet.chain === 'string' ? wallet.chain : null,
    chainType: typeof wallet.chainType === 'string' ? wallet.chainType : null,
    provider: typeof wallet.provider === 'string' ? wallet.provider : null,
    caip2: typeof wallet.caip2 === 'string' ? wallet.caip2 : null,
    accountId: typeof account?.id === 'string' ? account.id : null,
    label:
      typeof account?.displayName === 'string'
        ? account.displayName
        : typeof wallet.label === 'string'
          ? wallet.label
          : null,
  };
};

export type ChallengeMessageEncoding = 'utf-8' | 'hex';

export const detectMessageEncoding = (
  message: string
): ChallengeMessageEncoding => {
  if (/^0x[0-9a-fA-F]*$/.test(message.trim())) {
    return 'hex';
  }
  return 'utf-8';
};
