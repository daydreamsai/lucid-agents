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
  const domain = options.domain ?? envVars.AGENT_DOMAIN;

  // Validate required AGENT_DOMAIN
  if (!domain || domain.trim() === '') {
    console.error(
      '[agent-kit-identity] AGENT_DOMAIN is required but not provided.'
    );
    console.error(
      'Please set AGENT_DOMAIN environment variable to your agent\'s domain (e.g., "agent.example.com")'
    );
    console.error(
      'or pass domain as an option: createAgentIdentity({ domain: "agent.example.com" })'
    );
    throw new Error(
      'Missing required AGENT_DOMAIN: Please set AGENT_DOMAIN environment variable or pass domain option.'
    );
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
