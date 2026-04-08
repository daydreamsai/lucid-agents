declare module "@lucid-agents/types/identity" {
  export interface TrustConfig {
    provider?: string;
    chain?: string;
    tier?: string;
    assets?: Array<Record<string, unknown>>;
    requirements?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }
}