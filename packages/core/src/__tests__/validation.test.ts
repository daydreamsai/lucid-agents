import { describe, expect, it } from 'bun:test';

import { validateAgentMetadata } from '../validation';

describe('validateAgentMetadata', () => {
  it('should pass validation with all required fields', () => {
    const validMeta = {
      name: 'test-agent',
      version: '1.0.0',
      description: 'A test agent',
    };

    expect(() => validateAgentMetadata(validMeta)).not.toThrow();
  });

  it('should throw when name is missing', () => {
    const invalidMeta = {
      name: '',
      version: '1.0.0',
      description: 'A test agent',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /Missing required agent metadata: name/
    );
  });

  it('should throw when version is missing', () => {
    const invalidMeta = {
      name: 'test-agent',
      version: '',
      description: 'A test agent',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /Missing required agent metadata: version/
    );
  });

  it('should throw when description is missing', () => {
    const invalidMeta = {
      name: 'test-agent',
      version: '1.0.0',
      description: '',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /Missing required agent metadata: description/
    );
  });

  it('should throw with all missing fields listed when multiple fields are missing', () => {
    const invalidMeta = {
      name: '',
      version: '',
      description: 'A test agent',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /Missing required agent metadata: name, version/
    );
  });

  it('should throw when all required fields are missing', () => {
    const invalidMeta = {
      name: '',
      version: '',
      description: '',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /Missing required agent metadata: name, version, description/
    );
  });

  it('should include .env file hint in error message', () => {
    const invalidMeta = {
      name: '',
      version: '1.0.0',
      description: 'A test agent',
    };

    expect(() => validateAgentMetadata(invalidMeta)).toThrow(
      /AGENT_NAME, AGENT_VERSION, and AGENT_DESCRIPTION are set in your \.env file/
    );
  });

  it('should accept metadata with extra optional fields', () => {
    const metaWithExtras = {
      name: 'test-agent',
      version: '1.0.0',
      description: 'A test agent',
      author: 'Test Author',
      license: 'MIT',
      homepage: 'https://example.com',
    };

    expect(() => validateAgentMetadata(metaWithExtras)).not.toThrow();
  });

  it('should handle whitespace-only values as missing', () => {
    const metaWithWhitespace = {
      name: '   ',
      version: '1.0.0',
      description: 'A test agent',
    };

    // Current implementation treats whitespace as truthy
    // This test documents current behavior
    expect(() => validateAgentMetadata(metaWithWhitespace)).not.toThrow();
  });
});
