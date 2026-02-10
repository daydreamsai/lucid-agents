import type { TrustConfig } from '@lucid-agents/types/identity';

import type { AgentRegistrationOptions, RegistrationServiceName } from './init';
import { parseBoolean, parseOASFStructuredConfigFromEnv } from './validation';

export type IdentityConfig = {
  trust?: TrustConfig;
  domain?: string;
  autoRegister?: boolean;
  rpcUrl?: string;
  chainId?: number;
  registration?: AgentRegistrationOptions;
};

function parseSelectedServices(
  env: Record<string, string | undefined>
): RegistrationServiceName[] | undefined {
  const selected: RegistrationServiceName[] = [];

  if (parseBoolean(env.IDENTITY_INCLUDE_A2A)) {
    selected.push('A2A');
  }
  if (parseBoolean(env.IDENTITY_INCLUDE_WEB)) {
    selected.push('web');
  }
  if (parseBoolean(env.IDENTITY_INCLUDE_OASF)) {
    selected.push('OASF');
  }
  if (parseBoolean(env.IDENTITY_INCLUDE_TWITTER)) {
    selected.push('twitter');
  }
  if (parseBoolean(env.IDENTITY_INCLUDE_EMAIL)) {
    selected.push('email');
  }

  return selected.length > 0 ? selected : undefined;
}

/**
 * Creates IdentityConfig from environment variables.
 *
 * Reads from:
 * - AGENT_DOMAIN - Agent domain (required for registration)
 * - REGISTER_IDENTITY or IDENTITY_AUTO_REGISTER - Auto-register if not found (defaults to false)
 * - RPC_URL - Blockchain RPC URL (required)
 * - CHAIN_ID - Chain ID for ERC-8004 registry (required)
 *
 * @param configOverrides - Optional config overrides
 * @returns IdentityConfig resolved from env + overrides
 */
export function identityFromEnv(
  configOverrides?: Partial<IdentityConfig>
): IdentityConfig {
  const env =
    typeof process !== 'undefined'
      ? process.env
      : ({} as Record<string, string | undefined>);

  const domain = configOverrides?.domain ?? env.AGENT_DOMAIN;
  const rpcUrl = configOverrides?.rpcUrl ?? env.RPC_URL;
  const chainId =
    configOverrides?.chainId ??
    (env.CHAIN_ID ? parseInt(env.CHAIN_ID) : undefined);

  // Parse autoRegister from environment (support both REGISTER_IDENTITY and IDENTITY_AUTO_REGISTER)
  let autoRegister: boolean | undefined = configOverrides?.autoRegister;
  if (autoRegister === undefined) {
    const registerIdentityEnv =
      env.REGISTER_IDENTITY ?? env.IDENTITY_AUTO_REGISTER;
    if (registerIdentityEnv !== undefined) {
      autoRegister = parseBoolean(registerIdentityEnv);
    }
  }

  const selectedServices = parseSelectedServices(env);
  const oasf = parseOASFStructuredConfigFromEnv(env);

  const envRegistration: AgentRegistrationOptions = {
    a2aEndpoint: env.IDENTITY_A2A_ENDPOINT,
    a2aVersion: env.IDENTITY_A2A_VERSION,
    website: env.IDENTITY_WEBSITE,
    twitter: env.IDENTITY_TWITTER,
    email: env.IDENTITY_EMAIL,
    oasf,
    selectedServices,
  };
  const hasEnvRegistrationConfig = Boolean(
    envRegistration.a2aEndpoint ||
    envRegistration.a2aVersion ||
    envRegistration.website ||
    envRegistration.twitter ||
    envRegistration.email ||
    envRegistration.oasf ||
    envRegistration.selectedServices
  );

  return {
    trust: configOverrides?.trust,
    domain,
    autoRegister,
    rpcUrl,
    chainId,
    registration: configOverrides?.registration
      ? configOverrides.registration
      : hasEnvRegistrationConfig
        ? envRegistration
        : undefined,
  };
}
