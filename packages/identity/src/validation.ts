import {
  OASF_STRICT_MODE_ERROR,
  type OASFStructuredConfig,
} from '@lucid-agents/types/identity';

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

const OASF_JSON_ARRAY_KEYS = [
  'IDENTITY_OASF_AUTHORS_JSON',
  'IDENTITY_OASF_SKILLS_JSON',
  'IDENTITY_OASF_DOMAINS_JSON',
  'IDENTITY_OASF_MODULES_JSON',
  'IDENTITY_OASF_LOCATORS_JSON',
] as const;

type OASFJsonArrayKey = (typeof OASF_JSON_ARRAY_KEYS)[number];
const OASF_OPTIONAL_SCALAR_KEYS = [
  'IDENTITY_OASF_ENDPOINT',
  'IDENTITY_OASF_VERSION',
] as const;

const OASF_JSON_EXAMPLES: Record<OASFJsonArrayKey, string> = {
  IDENTITY_OASF_AUTHORS_JSON: '["ops@agent.example.com"]',
  IDENTITY_OASF_SKILLS_JSON: '["reasoning","planning"]',
  IDENTITY_OASF_DOMAINS_JSON: '["finance","support"]',
  IDENTITY_OASF_MODULES_JSON: '["https://agent.example.com/modules/core"]',
  IDENTITY_OASF_LOCATORS_JSON:
    '["https://agent.example.com/.well-known/oasf-record.json"]',
};

const OASF_URI_ARRAY_KEYS: ReadonlySet<OASFJsonArrayKey> = new Set([
  'IDENTITY_OASF_MODULES_JSON',
  'IDENTITY_OASF_LOCATORS_JSON',
]);

function normalizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertValidUri(value: string, key: string, index?: number): void {
  try {
    // URL supports ipfs://, https://, mailto:, etc.
    new URL(value);
  } catch {
    const suffix = index === undefined ? '' : ` at index ${index}`;
    throw new Error(
      `[agent-kit-identity] Invalid ${key}${suffix}. Expected a valid URI string. Example: "https://agent.example.com/resource"`
    );
  }
}

function parseJsonArray(
  raw: string | undefined,
  key: OASFJsonArrayKey
): unknown[] {
  if (raw === undefined) {
    throw new Error(
      `[agent-kit-identity] Missing ${key}. Expected a JSON array string. Example: ${OASF_JSON_EXAMPLES[key]}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `[agent-kit-identity] Invalid ${key}. Expected a JSON array string. Example: ${OASF_JSON_EXAMPLES[key]}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `[agent-kit-identity] Invalid ${key}. Expected a JSON array string. Example: ${OASF_JSON_EXAMPLES[key]}`
    );
  }

  return parsed;
}

function parseStringArray(
  values: unknown[],
  key: OASFJsonArrayKey,
  requireUri: boolean
): string[] {
  return values.map((value, index) => {
    if (typeof value !== 'string') {
      throw new Error(
        `[agent-kit-identity] Invalid ${key} at index ${index}. Expected string values. Example: ${OASF_JSON_EXAMPLES[key]}`
      );
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new Error(
        `[agent-kit-identity] Invalid ${key} at index ${index}. Empty strings are not allowed. Example: ${OASF_JSON_EXAMPLES[key]}`
      );
    }

    if (requireUri) {
      assertValidUri(normalized, key, index);
    }

    return normalized;
  });
}

function parseRequiredJsonArrayString(
  env: Record<string, string | undefined>,
  key: OASFJsonArrayKey
): string[] {
  const values = parseJsonArray(env[key], key);
  return parseStringArray(values, key, OASF_URI_ARRAY_KEYS.has(key));
}

function isOASFServiceSelected(selectedServices: unknown): boolean {
  if (!Array.isArray(selectedServices)) {
    return false;
  }

  return selectedServices.some(
    service =>
      typeof service === 'string' && service.toLowerCase().trim() === 'oasf'
  );
}

function hasAnyOASFEnvValues(env: Record<string, string | undefined>): boolean {
  const hasValue = (value: string | undefined): boolean =>
    value !== undefined && value.trim().length > 0;
  return (
    OASF_JSON_ARRAY_KEYS.some(key => hasValue(env[key])) ||
    OASF_OPTIONAL_SCALAR_KEYS.some(key => hasValue(env[key]))
  );
}

function validateOASFStructuredConfig(
  config: OASFStructuredConfig,
  context: string
): void {
  const requiredStringArrays: Array<[keyof OASFStructuredConfig, string]> = [
    ['authors', 'IDENTITY_OASF_AUTHORS_JSON'],
    ['skills', 'IDENTITY_OASF_SKILLS_JSON'],
    ['domains', 'IDENTITY_OASF_DOMAINS_JSON'],
    ['modules', 'IDENTITY_OASF_MODULES_JSON'],
    ['locators', 'IDENTITY_OASF_LOCATORS_JSON'],
  ];

  for (const [field, envKey] of requiredStringArrays) {
    const value = config[field];
    if (!Array.isArray(value)) {
      throw new Error(
        `[agent-kit-identity] Missing ${context}.${String(
          field
        )}. Expected a string[] (JSON array via ${envKey}).`
      );
    }

    for (const [index, item] of value.entries()) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new Error(
          `[agent-kit-identity] Invalid ${context}.${String(
            field
          )}[${index}]. Expected a non-empty string.`
        );
      }

      if ((field === 'modules' || field === 'locators') && item.trim()) {
        assertValidUri(item.trim(), `${context}.${String(field)}`, index);
      }
    }
  }

  if (config.endpoint) {
    assertValidUri(config.endpoint, `${context}.endpoint`);
  }
}

export function parseOASFStructuredConfigFromEnv(
  env: Record<string, string | undefined>
): OASFStructuredConfig | undefined {
  const includeOASF = parseBoolean(env.IDENTITY_INCLUDE_OASF);

  if (!includeOASF) {
    if (hasAnyOASFEnvValues(env)) {
      throw new Error(
        '[agent-kit-identity] Conflicting OASF configuration. Set IDENTITY_INCLUDE_OASF=true when providing OASF JSON-array fields.'
      );
    }
    return undefined;
  }

  return {
    endpoint: normalizeString(env.IDENTITY_OASF_ENDPOINT),
    version: normalizeString(env.IDENTITY_OASF_VERSION),
    authors: parseRequiredJsonArrayString(env, 'IDENTITY_OASF_AUTHORS_JSON'),
    skills: parseRequiredJsonArrayString(env, 'IDENTITY_OASF_SKILLS_JSON'),
    domains: parseRequiredJsonArrayString(env, 'IDENTITY_OASF_DOMAINS_JSON'),
    modules: parseRequiredJsonArrayString(env, 'IDENTITY_OASF_MODULES_JSON'),
    locators: parseRequiredJsonArrayString(env, 'IDENTITY_OASF_LOCATORS_JSON'),
  };
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

  const registration = options.registration;
  const selectedOASF = isOASFServiceSelected(registration?.selectedServices);
  const hasInlineOASF = Boolean(registration?.oasf);
  const includeOASFFromEnv = parseBoolean(envVars.IDENTITY_INCLUDE_OASF);
  const oasfEnabled = selectedOASF || hasInlineOASF || includeOASFFromEnv;

  if (!oasfEnabled && hasAnyOASFEnvValues(envVars)) {
    errors.push(
      'OASF config requires IDENTITY_INCLUDE_OASF=true (or include "OASF" in selectedServices)'
    );
  }

  if (oasfEnabled) {
    try {
      if (typeof registration?.oasf === 'string') {
        throw new Error(`[agent-kit-identity] ${OASF_STRICT_MODE_ERROR}`);
      }

      const envOASF = includeOASFFromEnv
        ? parseOASFStructuredConfigFromEnv(envVars)
        : undefined;

      const inlineOASF =
        typeof registration?.oasf === 'object' && registration.oasf
          ? registration.oasf
          : undefined;

      const merged: OASFStructuredConfig = {
        endpoint: normalizeString(inlineOASF?.endpoint) ?? envOASF?.endpoint,
        version: normalizeString(inlineOASF?.version) ?? envOASF?.version,
        authors: inlineOASF?.authors ?? envOASF?.authors,
        skills: inlineOASF?.skills ?? envOASF?.skills,
        domains: inlineOASF?.domains ?? envOASF?.domains,
        modules: inlineOASF?.modules ?? envOASF?.modules,
        locators: inlineOASF?.locators ?? envOASF?.locators,
      };

      validateOASFStructuredConfig(merged, 'registration.oasf');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`OASF config error: ${message}`);
    }
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
