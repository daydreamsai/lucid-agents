import { afterEach, describe, expect, it } from 'bun:test';

import { identityFromEnv } from '../env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('identityFromEnv', () => {
  it('parses strict OASF JSON-array fields when enabled', () => {
    process.env.IDENTITY_INCLUDE_OASF = 'true';
    process.env.IDENTITY_OASF_ENDPOINT =
      'https://agent.example.com/.well-known/oasf-record.json';
    process.env.IDENTITY_OASF_VERSION = '0.8.0';
    process.env.IDENTITY_OASF_AUTHORS_JSON = '["ops@agent.example.com"]';
    process.env.IDENTITY_OASF_SKILLS_JSON = '["reasoning"]';
    process.env.IDENTITY_OASF_DOMAINS_JSON = '["finance"]';
    process.env.IDENTITY_OASF_MODULES_JSON =
      '["https://agent.example.com/modules/core"]';
    process.env.IDENTITY_OASF_LOCATORS_JSON =
      '["https://agent.example.com/.well-known/oasf-record.json"]';

    const config = identityFromEnv();
    const oasf =
      typeof config.registration?.oasf === 'object'
        ? config.registration.oasf
        : undefined;

    expect(oasf?.authors).toEqual(['ops@agent.example.com']);
    expect(oasf?.skills).toEqual(['reasoning']);
    expect(oasf?.domains).toEqual(['finance']);
    expect(oasf?.modules).toEqual(['https://agent.example.com/modules/core']);
    expect(oasf?.locators).toEqual([
      'https://agent.example.com/.well-known/oasf-record.json',
    ]);
  });

  it('throws when OASF JSON-array field is invalid', () => {
    process.env.IDENTITY_INCLUDE_OASF = 'true';
    process.env.IDENTITY_OASF_AUTHORS_JSON = '{"bad":"shape"}';
    process.env.IDENTITY_OASF_SKILLS_JSON = '["reasoning"]';
    process.env.IDENTITY_OASF_DOMAINS_JSON = '["finance"]';
    process.env.IDENTITY_OASF_MODULES_JSON =
      '["https://agent.example.com/modules/core"]';
    process.env.IDENTITY_OASF_LOCATORS_JSON =
      '["https://agent.example.com/.well-known/oasf-record.json"]';

    expect(() => identityFromEnv()).toThrow(/IDENTITY_OASF_AUTHORS_JSON/);
  });

  it('throws on conflicting OASF values when include flag is false', () => {
    process.env.IDENTITY_INCLUDE_OASF = 'false';
    process.env.IDENTITY_OASF_AUTHORS_JSON = '["ops@agent.example.com"]';

    expect(() => identityFromEnv()).toThrow(/Conflicting OASF configuration/);
  });

  it('throws on conflicting OASF endpoint/version when include flag is false', () => {
    process.env.IDENTITY_INCLUDE_OASF = 'false';
    process.env.IDENTITY_OASF_ENDPOINT =
      'https://agent.example.com/.well-known/oasf-record.json';
    process.env.IDENTITY_OASF_VERSION = '0.8.0';

    expect(() => identityFromEnv()).toThrow(/Conflicting OASF configuration/);
  });
});
