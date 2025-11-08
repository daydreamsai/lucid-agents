export type TrustModel =
  | 'feedback'
  | 'inference-validation'
  | 'tee-attestation'
  | string;

export type RegistrationEntry = {
  agentId: number | string;
  agentAddress: string;
  signature?: string;
  [key: string]: unknown;
};

export type TrustConfig = {
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  validationRequestsUri?: string;
  validationResponsesUri?: string;
  feedbackDataUri?: string;
};
