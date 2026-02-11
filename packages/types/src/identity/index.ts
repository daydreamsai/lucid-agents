/**
 * Trust model types supported by ERC-8004.
 */
export type TrustModel =
  | 'feedback'
  | 'inference-validation'
  | 'tee-attestation'
  | string;

export const DEFAULT_OASF_VERSION = '0.8.0';
export const DEFAULT_OASF_RECORD_PATH = '/.well-known/oasf-record.json';
export const OASF_STRICT_MODE_ERROR =
  'Invalid registration.oasf. OASF strict mode requires structured JSON-array fields (authors/skills/domains/modules/locators).';

/**
 * Entry for agent registration in ERC-8004 identity registry.
 */
export type RegistrationEntry = {
  agentId: number | string;
  /**
   * CAIP-10 address of the ERC-8004 Identity Registry contract.
   * Format: namespace:chainId:address (e.g., eip155:84532:0xabc...)
   */
  agentRegistry: string;
  /**
   * Optional CAIP-10 address for the agent owner wallet (legacy field).
   */
  agentAddress?: string;
  signature?: string;
  [key: string]: unknown;
};

export type AgentService = {
  /**
   * Optional service version.
   */
  version?: string;
  /**
   * Optional OASF skill declarations.
   */
  skills?: unknown[];
  /**
   * Optional OASF domains declarations.
   */
  domains?: unknown[];
  /**
   * Legacy compatibility aliases.
   */
  description?: string;
  [key: string]: unknown;
} & (
  | {
      /**
       * Canonical service fields.
       */
      name: string;
      endpoint: string;
      id?: string;
      type?: string;
      serviceEndpoint?: string;
    }
  | {
      /**
       * Legacy service fields (supported for compatibility).
       */
      id?: string;
      type?: string;
      serviceEndpoint: string;
      name?: string;
      endpoint?: string;
    }
);

/**
 * ERC-8004 agent registration file structure.
 */
export type AgentRegistration = {
  type: 'agent' | 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description?: string;
  image?: string;
  domain?: string;
  url?: string;
  owner?: string;
  services?: AgentService[];
  x402Support?: boolean;
  active?: boolean;
  registrations?: RegistrationEntry[];
  supportedTrust?: TrustModel[];
  [key: string]: unknown;
};

/**
 * Structured OASF configuration for registration and record generation.
 */
export type OASFStructuredConfig = {
  endpoint?: string;
  version?: string;
  authors?: string[];
  skills?: string[];
  domains?: string[];
  modules?: string[];
  locators?: string[];
};

/**
 * Auto-generated OASF skill metadata derived from runtime entrypoints.
 */
export type OASFSkillRecord = {
  key: string;
  description?: string;
  streaming?: boolean;
  input?: unknown;
  output?: unknown;
};

/**
 * OASF record exposed by the SDK.
 */
export type OASFRecord = {
  type: string;
  name: string;
  description?: string;
  version: string;
  endpoint: string;
  authors: string[];
  skills: string[];
  domains: string[];
  modules: string[];
  locators: string[];
  entrypoints: OASFSkillRecord[];
};

/**
 * Trust configuration for ERC-8004 identity and reputation.
 */
export type TrustConfig = {
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  validationRequestsUri?: string;
  validationResponsesUri?: string;
  feedbackDataUri?: string;
};
