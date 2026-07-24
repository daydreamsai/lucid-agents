import { custom } from '@lucid-agents/mpp';
import type {
  MppCredentialVerifier,
  MppServerMethod,
} from '@lucid-agents/types/mpp';
import { Challenge, Credential } from 'mppx';

type ReferenceCustomClaim = {
  challengeId: string;
  amount: string;
  currency: string;
  recipient: string;
  method: string;
  intent: string;
  payer: string;
  expires: string;
  settled: true;
  signature: string;
};

export type ReferenceCustomSettlementContext = {
  challengeId: string;
  idempotencyKey?: string;
  payer: string;
};

export type ReferenceCustomSettlement = {
  /** Durable, already serialized provider receipt safe for an HTTP header. */
  receipt: string;
};

export type ReferenceCustomMppMethodOptions = {
  name: string;
  secret: string;
  recipient: string;
  payer: string;
  network: string;
  settle(
    context: ReferenceCustomSettlementContext
  ): ReferenceCustomSettlement | Promise<ReferenceCustomSettlement>;
};

type ReferenceCustomMppMethod = {
  method: MppServerMethod;
  verifier: MppCredentialVerifier;
  createCredential(
    challenge: Challenge.Challenge<Record<string, unknown>>,
    overrides?: Partial<Omit<ReferenceCustomClaim, 'signature'>>
  ): Promise<string>;
};

function canonicalClaim(
  claim: Omit<ReferenceCustomClaim, 'signature'>
): string {
  return JSON.stringify([
    claim.challengeId,
    claim.amount,
    claim.currency,
    claim.recipient,
    claim.method,
    claim.intent,
    claim.payer,
    claim.expires,
    claim.settled,
  ]);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(
  secret: string,
  claim: Omit<ReferenceCustomClaim, 'signature'>
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    new TextEncoder().encode(canonicalClaim(claim))
  );
  return Buffer.from(signature).toString('base64url');
}

async function authentic(
  secret: string,
  claim: ReferenceCustomClaim
): Promise<boolean> {
  let signature: ArrayBuffer;
  try {
    signature = Uint8Array.from(
      Buffer.from(claim.signature, 'base64url')
    ).buffer;
  } catch {
    return false;
  }
  const { signature: _signature, ...unsigned } = claim;
  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(canonicalClaim(unsigned))
  );
}

function parseClaim(
  value: Record<string, unknown>
): ReferenceCustomClaim | null {
  if (
    typeof value.challengeId !== 'string' ||
    typeof value.amount !== 'string' ||
    typeof value.currency !== 'string' ||
    typeof value.recipient !== 'string' ||
    typeof value.method !== 'string' ||
    typeof value.intent !== 'string' ||
    typeof value.payer !== 'string' ||
    typeof value.expires !== 'string' ||
    value.settled !== true ||
    typeof value.signature !== 'string'
  ) {
    return null;
  }
  return value as ReferenceCustomClaim;
}

/**
 * Deterministic reference for application-owned custom MPP verification.
 *
 * This is an example payment rail, not a production provider. It demonstrates
 * the checks, idempotent settlement boundary, and redacted metadata a real
 * provider integration must implement.
 */
export function createReferenceCustomMppMethod(
  options: ReferenceCustomMppMethodOptions
): ReferenceCustomMppMethod {
  const settled = new Map<string, Promise<ReferenceCustomSettlement>>();
  const method = custom.server(options.name, {
    recipient: options.recipient,
  });

  const verifier: MppCredentialVerifier = async context => {
    const claim = parseClaim(context.credential.payload);
    const challenge = context.credential.challenge;
    if (
      !claim ||
      !(await authentic(options.secret, claim)) ||
      claim.challengeId !== challenge.id ||
      claim.amount !== context.requirement.amount ||
      claim.amount !== challenge.request.amount ||
      claim.currency !== context.requirement.currency ||
      claim.currency !== challenge.request.currency ||
      claim.recipient !== options.recipient ||
      claim.recipient !== challenge.request.recipient ||
      claim.method !== options.name ||
      claim.method !== challenge.method ||
      claim.intent !== context.requirement.intent ||
      claim.intent !== challenge.intent ||
      claim.payer !== options.payer ||
      claim.payer !== context.credential.source ||
      claim.expires !== challenge.request.expires ||
      Date.parse(claim.expires) <= Date.now()
    ) {
      return { valid: false, reason: 'invalid custom payment credential' };
    }

    const idempotencyKey =
      context.request.headers.get('Idempotency-Key') ?? undefined;
    const settlementKey = idempotencyKey ?? challenge.id;
    let settlement = settled.get(settlementKey);
    if (!settlement) {
      settlement = Promise.resolve().then(() =>
        options.settle({
          challengeId: challenge.id,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          payer: claim.payer,
        })
      );
      settled.set(settlementKey, settlement);
    }
    const result = await settlement;
    return {
      valid: true,
      receipt: result.receipt,
      payer: claim.payer,
      network: options.network,
    };
  };

  return {
    method,
    verifier,
    async createCredential(challenge, overrides) {
      const unsigned = {
        challengeId: challenge.id,
        amount: String(challenge.request.amount),
        currency: String(challenge.request.currency),
        recipient: String(challenge.request.recipient),
        method: challenge.method,
        intent: challenge.intent,
        payer: options.payer,
        expires: String(challenge.request.expires),
        settled: true as const,
        ...overrides,
      };
      return Credential.serialize({
        challenge,
        payload: {
          ...unsigned,
          signature: await sign(options.secret, unsigned),
        },
        source: options.payer,
      });
    },
  };
}
