/**
 * AP2 (Agent Payments Protocol) role types.
 */
export type AP2Role =
  | 'merchant'
  | 'shopper'
  | 'credentials-provider'
  | 'payment-processor';

/**
 * Parameters for AP2 extension configuration.
 */
export type AP2ExtensionParams = {
  roles: [AP2Role, ...AP2Role[]];
  [key: string]: unknown;
};

/**
 * Descriptor for AP2 extension in agent manifest.
 */
export type AP2ExtensionDescriptor = {
  uri: 'https://github.com/google-agentic-commerce/ap2/tree/v0.1';
  description?: string;
  required?: boolean;
  params: AP2ExtensionParams;
};

/**
 * Configuration for AP2 (Agent Payments Protocol) extension.
 */
export type AP2Config = {
  roles: AP2Role[];
  description?: string;
  required?: boolean;
};

/**
 * AP2 runtime type.
 * Returned by AgentRuntime.ap2 when AP2 is configured.
 */
export type AP2Runtime = {
  readonly config: AP2Config;
};
