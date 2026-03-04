import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Attestation, AttestationKind } from "./contracts";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);

  return `{${entries.join(",")}}`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createRequestId(): string {
  try {
    return randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export interface CreateAttestationInput {
  kind: AttestationKind;
  datasetId: string;
  payload: unknown;
  subject: string;
  wallet: string;
  issuedAt: Date;
  secret: string;
  nonce?: string;
}

export function createAttestation(input: CreateAttestationInput): Attestation {
  const payloadHash = sha256Hex(stableStringify(input.payload));
  const nonce = input.nonce ?? createRequestId();
  const issuedAt = input.issuedAt.toISOString();

  const signaturePayload = stableStringify({
    datasetId: input.datasetId,
    issuedAt,
    kind: input.kind,
    nonce,
    payloadHash,
    subject: input.subject,
    wallet: input.wallet,
  });

  const signature = createHmac("sha256", input.secret)
    .update(signaturePayload)
    .digest("hex");

  return {
    id: `att_${createRequestId()}`,
    kind: input.kind,
    issuedAt,
    subject: input.subject,
    wallet: input.wallet,
    nonce,
    payloadHash,
    signature,
  };
}