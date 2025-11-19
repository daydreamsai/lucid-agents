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
  agentAddress: string;
  signature?: string;
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
