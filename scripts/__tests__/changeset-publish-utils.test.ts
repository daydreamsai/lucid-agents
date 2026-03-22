import { describe, expect, test } from 'bun:test';

import {
  describeNpmAccessFailure,
  describeNpmPublishFailure,
  partitionPublishArgs,
} from '../changeset-publish-utils';

describe('describeNpmAccessFailure', () => {
  test('explains invalid npm token errors', () => {
    const message = describeNpmAccessFailure({
      output: `npm ERR! code E401
npm ERR! Unable to authenticate, your authentication token seems to be invalid.`,
      packageName: '@lucid-agents/core',
      scope: '@lucid-agents',
    });

    expect(message).toContain('NPM_TOKEN is missing or invalid');
    expect(message).toContain('@lucid-agents/core');
  });

  test('explains missing scope permissions', () => {
    const message = describeNpmAccessFailure({
      output: `npm ERR! code E404
npm ERR! 404 Not Found - GET https://registry.npmjs.org/-/package/@lucid-agents%2fcore/collaborators?format=cli`,
      packageName: '@lucid-agents/core',
      scope: '@lucid-agents',
    });

    expect(message).toContain('lacks collaborator or publish access');
    expect(message).toContain('@lucid-agents');
  });
});

describe('describeNpmPublishFailure', () => {
  test('turns publish put 404s into a permission hint', () => {
    const message = describeNpmPublishFailure({
      output: `npm ERR! code E404
npm ERR! 404 Not Found - PUT https://registry.npmjs.org/@lucid-agents%2fanalytics - Not found
npm ERR! 404  '@lucid-agents/analytics@0.3.3' is not in this registry.`,
      scope: '@lucid-agents',
    });

    expect(message).toContain('likely a permissions problem');
    expect(message).toContain('@lucid-agents');
  });

  test('returns nothing for unrelated publish failures', () => {
    const message = describeNpmPublishFailure({
      output: 'npm ERR! code E500\nnpm ERR! Internal server error',
      scope: '@lucid-agents',
    });

    expect(message).toBeUndefined();
  });
});

describe('partitionPublishArgs', () => {
  test('extracts the preflight-only flag', () => {
    const result = partitionPublishArgs(['--preflight-only', '--tag', 'next']);

    expect(result.preflightOnly).toBe(true);
    expect(result.passthroughArgs).toEqual(['--tag', 'next']);
  });

  test('passes through regular changeset publish args unchanged', () => {
    const result = partitionPublishArgs(['--tag', 'beta']);

    expect(result.preflightOnly).toBe(false);
    expect(result.passthroughArgs).toEqual(['--tag', 'beta']);
  });
});
