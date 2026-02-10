import { describe, expect, it } from 'bun:test';

import type { CreateAgentIdentityOptions } from '../init';
import { validateIdentityConfig } from '../validation';

function makeOptions(
  overrides: Partial<CreateAgentIdentityOptions> = {}
): CreateAgentIdentityOptions {
  return {
    runtime: overrides.runtime ?? ({} as any),
    ...overrides,
  } as CreateAgentIdentityOptions;
}

describe('validateIdentityConfig', () => {
  it('passes when required values are provided via options', () => {
    expect(() =>
      validateIdentityConfig(
        makeOptions({
          domain: 'agent.example.com',
          rpcUrl: 'https://rpc.example.com',
          chainId: 84532,
        }),
        {}
      )
    ).not.toThrow();
  });

  it('throws when AGENT_DOMAIN is missing', () => {
    expect(() =>
      validateIdentityConfig(
        makeOptions({
          rpcUrl: 'https://rpc.example.com',
          chainId: 84532,
        }),
        {}
      )
    ).toThrow(/AGENT_DOMAIN/);
  });

  it('throws when RPC_URL is missing', () => {
    expect(() =>
      validateIdentityConfig(
        makeOptions({
          domain: 'agent.example.com',
          chainId: 84532,
        }),
        {}
      )
    ).toThrow(/RPC_URL/);
  });

  it('throws when CHAIN_ID is missing', () => {
    expect(() =>
      validateIdentityConfig(
        makeOptions({
          domain: 'agent.example.com',
          rpcUrl: 'https://rpc.example.com',
        }),
        {}
      )
    ).toThrow(/CHAIN_ID/);
  });

  it('uses environment variables as fallbacks', () => {
    expect(() =>
      validateIdentityConfig(makeOptions({}), {
        AGENT_DOMAIN: 'env-agent.example.com',
        RPC_URL: 'https://rpc.example.com',
        CHAIN_ID: '84532',
      })
    ).not.toThrow();
  });

  it('passes strict OASF validation with valid JSON arrays', () => {
    expect(() =>
      validateIdentityConfig(makeOptions({}), {
        AGENT_DOMAIN: 'env-agent.example.com',
        RPC_URL: 'https://rpc.example.com',
        CHAIN_ID: '84532',
        IDENTITY_INCLUDE_OASF: 'true',
        IDENTITY_OASF_ENDPOINT:
          'https://env-agent.example.com/.well-known/oasf-record.json',
        IDENTITY_OASF_VERSION: '0.8.0',
        IDENTITY_OASF_AUTHORS_JSON: '["ops@env-agent.example.com"]',
        IDENTITY_OASF_SKILLS_JSON: '["reasoning"]',
        IDENTITY_OASF_DOMAINS_JSON: '["finance"]',
        IDENTITY_OASF_MODULES_JSON:
          '["https://env-agent.example.com/modules/core"]',
        IDENTITY_OASF_LOCATORS_JSON:
          '["https://env-agent.example.com/.well-known/oasf-record.json"]',
      })
    ).not.toThrow();
  });

  it('throws when OASF is enabled but JSON arrays are missing', () => {
    expect(() =>
      validateIdentityConfig(makeOptions({}), {
        AGENT_DOMAIN: 'env-agent.example.com',
        RPC_URL: 'https://rpc.example.com',
        CHAIN_ID: '84532',
        IDENTITY_INCLUDE_OASF: 'true',
      })
    ).toThrow(/IDENTITY_OASF_AUTHORS_JSON/);
  });

  it('throws when OASF JSON array values are invalid', () => {
    expect(() =>
      validateIdentityConfig(makeOptions({}), {
        AGENT_DOMAIN: 'env-agent.example.com',
        RPC_URL: 'https://rpc.example.com',
        CHAIN_ID: '84532',
        IDENTITY_INCLUDE_OASF: 'true',
        IDENTITY_OASF_AUTHORS_JSON: '{"bad":"shape"}',
        IDENTITY_OASF_SKILLS_JSON: '["reasoning"]',
        IDENTITY_OASF_DOMAINS_JSON: '["finance"]',
        IDENTITY_OASF_MODULES_JSON:
          '["https://env-agent.example.com/modules/core"]',
        IDENTITY_OASF_LOCATORS_JSON:
          '["https://env-agent.example.com/.well-known/oasf-record.json"]',
      })
    ).toThrow(/IDENTITY_OASF_AUTHORS_JSON/);
  });

  it('throws on invalid URI values for modules/locators', () => {
    expect(() =>
      validateIdentityConfig(makeOptions({}), {
        AGENT_DOMAIN: 'env-agent.example.com',
        RPC_URL: 'https://rpc.example.com',
        CHAIN_ID: '84532',
        IDENTITY_INCLUDE_OASF: 'true',
        IDENTITY_OASF_AUTHORS_JSON: '["ops@env-agent.example.com"]',
        IDENTITY_OASF_SKILLS_JSON: '["reasoning"]',
        IDENTITY_OASF_DOMAINS_JSON: '["finance"]',
        IDENTITY_OASF_MODULES_JSON: '["not-a-uri"]',
        IDENTITY_OASF_LOCATORS_JSON:
          '["https://env-agent.example.com/.well-known/oasf-record.json"]',
      })
    ).toThrow(/IDENTITY_OASF_MODULES_JSON/);
  });
});
