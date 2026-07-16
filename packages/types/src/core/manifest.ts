import type { EntrypointDef } from './entrypoint';

/** Protocol-neutral metadata supplied when creating an agent runtime. */
export type AgentMeta = {
  name: string;
  version: string;
  description?: string;
  icon?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
};

export type ManifestEntrypoint = {
  description?: string;
  streaming: boolean;
  input_schema?: unknown;
  output_schema?: unknown;
  pricing?: { invoke?: string; stream?: string };
};

export type AgentManifest = {
  protocolVersion?: string;
  name: string;
  description?: string;
  url?: string;
  supportedInterfaces?: Array<{
    url: string;
    protocolBinding: string;
  }>;
  provider?: { organization?: string; url?: string };
  version?: string;
  documentationUrl?: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
    extensions?: Array<Record<string, unknown>>;
  };
  securitySchemes?: Record<string, unknown>;
  security?: unknown[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{
    id: string;
    name?: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
    security?: unknown[];
    [key: string]: unknown;
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  signatures?: Array<{
    protected: string;
    signature: string;
    header?: Record<string, unknown>;
  }>;
  iconUrl?: string;
  payments?: unknown[];
  registrations?: unknown[];
  trustModels?: string[];
  ValidationRequestsURI?: string;
  ValidationResponsesURI?: string;
  FeedbackDataURI?: string;
  entrypoints: Record<string, ManifestEntrypoint>;
  [key: string]: unknown;
};

export type ManifestRuntime = {
  build: (origin: string) => AgentManifest;
  invalidate: () => void;
};

export type BuildAgentManifestOptions = {
  meta: AgentMeta;
  registry: Iterable<EntrypointDef>;
  origin: string;
  stateTransitionHistory?: boolean;
};
