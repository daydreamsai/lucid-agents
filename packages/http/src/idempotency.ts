import type {
  HttpIdempotencyClaim,
  HttpIdempotencyStore,
  StoredHttpResponse,
} from '@lucid-agents/types/http';

type InMemoryIdempotencyRecord = {
  fingerprint: string;
  ownerId: string;
  expiresAt: number;
  response?: StoredHttpResponse;
};

export type InMemoryHttpIdempotencyStoreOptions = {
  maxEntries?: number;
  now?: () => number;
};

const AMBIENT_SECURITY_CONTEXT_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
] as const;

const NATIVE_AUTHORIZATION_HEADERS = [
  'payment',
  'payment-signature',
  'x-payment',
  'sign-in-with-x',
  'x-sign-in-with-x',
] as const;

/** Raised when all bounded idempotency slots are active claims. */
export class HttpIdempotencyCapacityError extends Error {
  constructor(maxEntries: number) {
    super(
      `HTTP idempotency capacity (${maxEntries}) is exhausted by active claims`
    );
    this.name = 'HttpIdempotencyCapacityError';
  }
}

/**
 * Create a bounded process-local idempotency store. Multi-instance services
 * should inject a durable implementation through `http({ idempotency })`.
 */
export function createInMemoryHttpIdempotencyStore(
  options: InMemoryHttpIdempotencyStoreOptions = {}
): HttpIdempotencyStore {
  const maxEntries = options.maxEntries ?? 10_000;
  const now = options.now ?? Date.now;
  const records = new Map<string, InMemoryIdempotencyRecord>();

  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error('maxEntries must be a positive integer');
  }

  const recordKey = (scope: string, key: string): string =>
    `${scope}\u0000${key}`;
  const purgeExpired = (currentTime = now()): void => {
    for (const [key, record] of records) {
      if (record.expiresAt <= currentTime) records.delete(key);
    }
  };
  const ensureCapacity = (currentTime: number): void => {
    purgeExpired(currentTime);
    if (records.size < maxEntries) return;
    const oldestCompleted = [...records.entries()]
      .filter(([, record]) => record.response)
      .sort((left, right) => left[1].expiresAt - right[1].expiresAt)[0];
    if (!oldestCompleted) throw new HttpIdempotencyCapacityError(maxEntries);
    records.delete(oldestCompleted[0]);
  };

  return {
    async claim(
      scope,
      key,
      fingerprint,
      ownerId,
      expiresAt,
      claimedAt
    ): Promise<HttpIdempotencyClaim> {
      const id = recordKey(scope, key);
      purgeExpired(claimedAt);
      const current = records.get(id);
      if (current) {
        if (current.fingerprint !== fingerprint) return { state: 'conflict' };
        if (current.response) {
          return { state: 'completed', response: current.response };
        }
        return { state: 'in_progress' };
      }
      ensureCapacity(claimedAt);
      records.set(id, { fingerprint, ownerId, expiresAt });
      return { state: 'claimed' };
    },
    async complete(scope, key, ownerId, response, expiresAt) {
      const id = recordKey(scope, key);
      const current = records.get(id);
      if (!current || current.ownerId !== ownerId || current.response) {
        return false;
      }
      records.set(id, { ...current, response, expiresAt });
      return true;
    },
    async release(scope, key, ownerId) {
      const id = recordKey(scope, key);
      if (records.get(id)?.ownerId === ownerId) records.delete(id);
    },
    close() {
      records.clear();
    },
  };
}

export async function fingerprintRequest(
  request: Request,
  authorizationSubject?: string
): Promise<string> {
  const body = await request.clone().text();
  const contextHeaders = authorizationSubject
    ? AMBIENT_SECURITY_CONTEXT_HEADERS
    : [...AMBIENT_SECURITY_CONTEXT_HEADERS, ...NATIVE_AUTHORIZATION_HEADERS];
  const securityContext = contextHeaders.flatMap(name => {
    const value = request.headers.get(name);
    return value === null ? [] : [[name, value]];
  });
  const material = JSON.stringify({
    method: request.method.toUpperCase(),
    url: request.url,
    body,
    authorizationSubject: authorizationSubject ?? null,
    securityContext,
  });
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function snapshotResponse(
  response: Response
): Promise<StoredHttpResponse> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: await response.clone().text(),
  };
}

export function restoreResponse(snapshot: StoredHttpResponse): Response {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.headers,
  });
}
