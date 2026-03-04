export const IMPACT_TAGS = [
  "privacy",
  "reporting",
  "security",
  "governance",
  "third_party",
  "data_retention"
] as const;

export type ImpactTagName = (typeof IMPACT_TAGS)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type ChangeType = "added" | "updated" | "removed";
export type SuggestedAction = "add" | "update" | "review";

export interface RegulationClause {
  id: string;
  text: string;
  controlHints?: string[];
}

export interface RegulationVersion {
  version: string;
  effectiveAt: string;
  summary: string;
  clauses: RegulationClause[];
}

export interface RegulationDocument {
  jurisdiction: string;
  regulationId: string;
  title: string;
  versions: RegulationVersion[];
}