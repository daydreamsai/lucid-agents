import { describe, expect, test } from 'bun:test';

import { renderReleaseNotes } from '../release-plan';

describe('renderReleaseNotes', () => {
  test('renders package versions and the summaries that produced them', () => {
    const notes = renderReleaseNotes({
      changesets: [
        {
          id: 'safe-release',
          summary: 'Require CI attestation before publishing.',
          releases: [{ name: '@lucid-agents/core', type: 'patch' }],
        },
      ],
      releases: [
        {
          name: '@lucid-agents/core',
          type: 'patch',
          oldVersion: '4.2.0',
          newVersion: '4.2.1',
          changesets: ['safe-release'],
        },
      ],
    });

    expect(notes).toContain('## @lucid-agents/core 4.2.1');
    expect(notes).toContain('Require CI attestation before publishing.');
  });

  test('renders a clear no-op plan', () => {
    expect(renderReleaseNotes({ changesets: [], releases: [] })).toBe(
      '# Release\n\nNo packages are scheduled for release.\n'
    );
  });

  test('ignores Changesets alignment entries that are not releases', () => {
    const notes = renderReleaseNotes({
      changesets: [],
      releases: [
        {
          name: 'lucid-docs',
          type: 'none',
          oldVersion: '',
          newVersion: '',
          changesets: [],
        },
      ],
    });

    expect(notes).toBe('# Release\n\nNo packages are scheduled for release.\n');
  });
});
