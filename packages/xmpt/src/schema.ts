import type { XmptEnvelope, XmptHeaders } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringRecord(value: unknown): value is XmptHeaders {
  if (!isObject(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `xmpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateEnvelopeInput<TPayload> {
  from: string;
  to: string;
  payload: TPayload;
  threadId?: string;
  headers?: XmptHeaders;
  replyTo?: string;
  id?: string;
  timestamp?: string | Date;
}

export function createEnvelope<TPayload>(
  input: CreateEnvelopeInput<TPayload>
): XmptEnvelope<TPayload> {
  if (!isNonEmptyString(input.from)) {
    throw new Error("XMPT envelope requires a non-empty 'from'.");
  }
  if (!isNonEmptyString(input.to)) {
    throw new Error("XMPT envelope requires a non-empty 'to'.");
  }

  const id = input.id ?? createId();
  const threadId = input.threadId ?? createId();
  const timestamp =
    input.timestamp instanceof Date
      ? input.timestamp.toISOString()
      : typeof input.timestamp === "string"
        ? input.timestamp
        : new Date().toISOString();

  const envelope: XmptEnvelope<TPayload> = {
    id,
    threadId,
    from: input.from,
    to: input.to,
    timestamp,
    payload: input.payload
  };

  if (input.headers && Object.keys(input.headers).length > 0) {
    envelope.headers = input.headers;
  }

  if (input.replyTo) {
    envelope.replyTo = input.replyTo;
  }

  return envelope;
}

export function assertEnvelope(value: unknown): asserts value is XmptEnvelope {
  if (!isObject(value)) {
    throw new Error("Invalid XMPT envelope: expected object.");
  }

  const candidate = value as Partial<XmptEnvelope>;

  if (!isNonEmptyString(candidate.id)) {
    throw new Error("Invalid XMPT envelope: missing 'id'.");
  }
  if (!isNonEmptyString(candidate.threadId)) {
    throw new Error("Invalid XMPT envelope: missing 'threadId'.");
  }
  if (!isNonEmptyString(candidate.from)) {
    throw new Error("Invalid XMPT envelope: missing 'from'.");
  }
  if (!isNonEmptyString(candidate.to)) {
    throw new Error("Invalid XMPT envelope: missing 'to'.");
  }
  if (!isNonEmptyString(candidate.timestamp)) {
    throw new Error("Invalid XMPT envelope: missing 'timestamp'.");
  }
  if (Number.isNaN(new Date(candidate.timestamp).getTime())) {
    throw new Error("Invalid XMPT envelope: invalid 'timestamp'.");
  }
  if (!("payload" in candidate)) {
    throw new Error("Invalid XMPT envelope: missing 'payload'.");
  }

  if (
    "headers" in candidate &&
    candidate.headers !== undefined &&
    !isStringRecord(candidate.headers)
  ) {
    throw new Error("Invalid XMPT envelope: 'headers' must be Record<string,string>.");
  }

  if (
    "replyTo" in candidate &&
    candidate.replyTo !== undefined &&
    !isNonEmptyString(candidate.replyTo)
  ) {
    throw new Error("Invalid XMPT envelope: 'replyTo' must be a non-empty string.");
  }
}

export function assertReplyInput(value: unknown): asserts value is {
  threadId: string;
  payload: unknown;
  to?: string;
} {
  if (!isObject(value)) {
    throw new Error("Invalid XMPT reply: expected object.");
  }

  if (!isNonEmptyString(value.threadId)) {
    throw new Error("Invalid XMPT reply: missing 'threadId'.");
  }

  if (!("payload" in value)) {
    throw new Error("Invalid XMPT reply: missing 'payload'.");
  }

  if ("to" in value && value.to !== undefined && !isNonEmptyString(value.to)) {
    throw new Error("Invalid XMPT reply: 'to' must be non-empty when provided.");
  }
}