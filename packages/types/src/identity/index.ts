/**
 * Trust model types supported by ERC-8004.
 */
export type TrustModel =
  | 'feedback'
  | 'inference-validation'
  | 'tee-attestation'
  | string;

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
  id?: string;
  type?: string;
  serviceEndpoint: string;
  description?: string;
  [key: string]: unknown;
};

/**
 * ERC-8004 agent registration file structure.
 */
export type AgentRegistration = {
  type: 'agent';
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
 * Trust configuration for ERC-8004 identity and reputation.
 */
export type TrustConfig = {
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  validationRequestsUri?: string;
  validationResponsesUri?: string;
  feedbackDataUri?: string;
};
