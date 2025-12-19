import type { CreateAgentIdentityOptions } from './init';

/**
 * Parse a boolean environment variable in a case-insensitive way.
 * Accepts: "true", "1", "yes", "on" (case-insensitive)
 *
 * @param value - The string value to parse
 * @returns true if the value matches a truthy pattern, false otherwise
 */
export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim());
}

/**
 * Validates identity configuration and throws descriptive errors if invalid.
 *
 * @param options - CreateAgentIdentityOptions to validate
 * @param env - Environment variables (defaults to process.env)
 * @throws Error if required configuration is missing or invalid
 */
export function validateIdentityConfig(
  options: CreateAgentIdentityOptions,
  env?: Record<string, string | undefined>
): void {
  const envVars = env ?? (typeof process !== 'undefined' ? process.env : {});
  const errors: string[] = [];

  const domain = (options.domain ?? envVars.AGENT_DOMAIN)?.trim();
  if (!domain) {
    errors.push('AGENT_DOMAIN (set AGENT_DOMAIN or pass the domain option)');
  }

  const rpcUrl = (options.rpcUrl ?? envVars.RPC_URL)?.trim();
  if (!rpcUrl) {
    errors.push('RPC_URL (set RPC_URL or pass the rpcUrl option)');
  }

  const chainId =
    options.chainId ??
    (envVars.CHAIN_ID ? Number(envVars.CHAIN_ID) : undefined);
  if (!chainId || Number.isNaN(chainId)) {
    errors.push('CHAIN_ID (set CHAIN_ID or pass the chainId option)');
  }

  if (errors.length > 0) {
    const message = `[agent-kit-identity] Missing required identity configuration:\n - ${errors.join(
      '\n - '
    )}`;
    console.error(message);
    throw new Error(message);
  }
}

/**
 * Resolves and validates the autoRegister flag from options or environment.
 * Supports case-insensitive boolean parsing for environment variables.
 *
 * @param options - CreateAgentIdentityOptions
 * @param env - Environment variables (defaults to process.env)
 * @returns Resolved autoRegister boolean value
 */
export function resolveAutoRegister(
  options: CreateAgentIdentityOptions,
  env?: Record<string, string | undefined>
): boolean {
  const envVars = env ?? (typeof process !== 'undefined' ? process.env : {});

  // If explicitly set in options, use that
  if (options.autoRegister !== undefined) {
    return options.autoRegister;
  }

  // Otherwise parse from environment variable (case-insensitive)
  const autoRegisterEnv = envVars.IDENTITY_AUTO_REGISTER;
  if (autoRegisterEnv !== undefined) {
    return parseBoolean(autoRegisterEnv);
  }

  // Default to true if not specified anywhere
  return true;
}
