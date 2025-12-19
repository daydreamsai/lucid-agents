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
});
