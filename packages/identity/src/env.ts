import { parseBoolean } from './validation';

export type IdentityConfig = {
  trust?: import('@lucid-agents/types/identity').TrustConfig;
  domain?: string;
  autoRegister?: boolean;
  rpcUrl?: string;
  chainId?: number;
};

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

  return {
    trust: configOverrides?.trust,
    domain,
    autoRegister,
    rpcUrl,
    chainId,
  };
}
