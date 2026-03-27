export const SLA_TIERS = ["bronze", "silver", "gold", "platinum"] as const;
export type SlaTier = (typeof SLA_TIERS)[number];

export type AttestationKind = "lineage" | "freshness" | "tamper-check";

export interface Attestation {
  id: string;
  kind: AttestationKind;
  issuedAt: string;
  subject: string;
  wallet: string;
  nonce: string;
  payloadHash: string;
  signature: string;
}

export interface LineageNode {
  id: string;
  label: string;
  kind: "dataset";
  lastUpdatedAt: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  relationship: "derived_from";
}

export interface LineageResponse {
  datasetId: string;
  rootId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  attestation: Attestation;
}

export interface FreshnessResponse {
  datasetId: string;
  slaTier: SlaTier;
  maxAgeMs: number;
  ageMs: number;
  isFresh: boolean;
  lastUpdatedAt: string;
  nextBreachAt: string;
  attestation: Attestation;
}

export interface VerifyHashResponse {
  datasetId: string;
  algorithm: "sha256";
  providedHash: string;
  canonicalHash: string;
  verified: boolean;
  tamperState: "untampered" | "tampered";
  attestation: Attestation;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export interface ProvenanceHttpRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ProvenanceHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: LineageResponse | FreshnessResponse | VerifyHashResponse | ErrorResponse;
}

export function isSlaTier(value: unknown): value is SlaTier {
  return typeof value === "string" && (SLA_TIERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isAttestation(value: unknown): value is Attestation {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.kind) &&
    isString(value.issuedAt) &&
    isString(value.subject) &&
    isString(value.wallet) &&
    isString(value.nonce) &&
    isString(value.payloadHash) &&
    isString(value.signature)
  );
}

function isLineageNode(value: unknown): value is LineageNode {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.label) &&
    value.kind === "dataset" &&
    isString(value.lastUpdatedAt)
  );
}

function isLineageEdge(value: unknown): value is LineageEdge {
  if (!isRecord(value)) return false;
  return (
    isString(value.from) &&
    isString(value.to) &&
    value.relationship === "derived_from"
  );
}

export function isLineageResponse(value: unknown): value is LineageResponse {
  if (!isRecord(value)) return false;
  if (!isString(value.datasetId) || !isString(value.rootId)) return false;
  if (!Array.isArray(value.nodes) || !value.nodes.every(isLineageNode)) return false;
  if (!Array.isArray(value.edges) || !value.edges.every(isLineageEdge)) return false;
  return isAttestation(value.attestation);
}

export function isFreshnessResponse(value: unknown): value is FreshnessResponse {
  if (!isRecord(value)) return false;
  return (
    isString(value.datasetId) &&
    isSlaTier(value.slaTier) &&
    isNumber(value.maxAgeMs) &&
    isNumber(value.ageMs) &&
    isBoolean(value.isFresh) &&
    isString(value.lastUpdatedAt) &&
    isString(value.nextBreachAt) &&
    isAttestation(value.attestation)
  );
}

export function isVerifyHashResponse(value: unknown): value is VerifyHashResponse {
  if (!isRecord(value)) return false;
  return (
    isString(value.datasetId) &&
    value.algorithm === "sha256" &&
    isString(value.providedHash) &&
    isString(value.canonicalHash) &&
    isBoolean(value.verified) &&
    (value.tamperState === "untampered" || value.tamperState === "tampered") &&
    isAttestation(value.attestation)
  );
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  return (
    isString(value.error.code) &&
    isString(value.error.message) &&
    isString(value.error.requestId)
  );
}