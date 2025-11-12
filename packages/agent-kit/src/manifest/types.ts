import type {
  RegistrationEntry,
  TrustModel,
} from '@lucid-agents/agent-kit-identity';
import type { SolanaAddress } from '@lucid-agents/agent-kit-payments';
import type { Network, Resource } from 'x402/types';

import type { AP2ExtensionDescriptor, AP2Role } from './ap2';

export type Manifest = {
  name: string;
  version: string;
  description?: string;
  entrypoints: Record<
    string,
    {
      description?: string;
      streaming: boolean;
      input_schema?: any;
      output_schema?: any;
      pricing?: { invoke?: string; stream?: string };
    }
  >;
};

// A2A Agent Card types
export type PaymentMethod = {
  method: 'x402';
  payee: `0x${string}` | SolanaAddress;
  network: Network;
  endpoint?: Resource;
  priceModel?: { default?: string };
  extensions?: { [vendor: string]: unknown };
};

export type AgentCapabilities = {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: Array<AP2ExtensionDescriptor | Record<string, unknown>>;
};

export type AgentCard = {
  name: string;
  description?: string;
  url?: string;
  provider?: { organization?: string; url?: string };
  version?: string;
  capabilities?: AgentCapabilities;
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
    [key: string]: unknown;
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  payments?: PaymentMethod[];
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  ValidationRequestsURI?: string;
  ValidationResponsesURI?: string;
  FeedbackDataURI?: string;
  [key: string]: unknown;
};

export type AgentCardWithEntrypoints = AgentCard & {
  entrypoints: Manifest['entrypoints'];
};

export type AP2Config = {
  roles: AP2Role[];
  description?: string;
  required?: boolean;
};
