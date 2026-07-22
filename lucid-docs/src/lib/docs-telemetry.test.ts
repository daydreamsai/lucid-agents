import { describe, expect, it } from 'bun:test';

import { isDocsEvent } from './docs-telemetry';

describe('documentation telemetry', () => {
  it('accepts only bounded, non-payload funnel events', () => {
    expect(
      isDocsEvent({ name: 'path_selected', path: '/', stage: 'seller' })
    ).toBe(true);
    expect(
      isDocsEvent({
        name: 'skill_install_command_copied',
        path: '/',
        stage: 'install',
      })
    ).toBe(true);
    expect(
      isDocsEvent({
        name: 'page_view',
        path: '/',
        wallet: '0xsecret',
      })
    ).toBe(false);
    expect(
      isDocsEvent({ name: 'path_selected', path: '/', stage: 'arbitrary' })
    ).toBe(false);
    expect(isDocsEvent({ name: 'page_view', path: 'not-absolute' })).toBe(
      false
    );
  });
});
