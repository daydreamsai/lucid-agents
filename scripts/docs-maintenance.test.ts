import { describe, expect, it } from 'bun:test';

import {
  documentationFreshness,
  documentationOwner,
  externalDocumentationLinks,
  isCheckableExternalLink,
} from './docs-maintenance';

describe('documentation maintenance', () => {
  it('extracts and deduplicates Markdown, autolink, and JSX links', () => {
    expect(
      externalDocumentationLinks(
        '[Spec](https://example.org/spec) <https://example.org/spec> <a href="https://example.org/api">API</a>'
      )
    ).toEqual(['https://example.org/api', 'https://example.org/spec']);
  });

  it('skips placeholders while retaining real public links', () => {
    expect(isCheckableExternalLink('https://seller.example/report')).toBe(
      false
    );
    expect(isCheckableExternalLink('https://YOUR_FACILITATOR_URL')).toBe(false);
    expect(
      isCheckableExternalLink('https://github.com/daydreamsai/lucid-agents')
    ).toBe(true);
  });

  it('routes pages to owners and reports stale verification dates', () => {
    const records = documentationFreshness(
      [
        {
          path: 'packages/payments.mdx',
          source: '---\nverifiedAt: 2026-01-01\n---\n',
        },
      ],
      new Date('2026-07-20T00:00:00.000Z'),
      90
    );

    expect(documentationOwner('products/router.mdx')).toBe(
      'Hosted product owner'
    );
    expect(records[0]).toMatchObject({
      owner: 'Package owner: @lucid-agents/payments',
      ageDays: 200,
      stale: true,
    });
  });
});
