import { describe, expect, it } from 'bun:test';

import {
  type DocumentationPage,
  validateDocumentationRedirects,
  validateDocumentationPages,
} from './docs-content';

function page(
  path: string,
  source: string,
  routes: string[] = ['/docs/start/install']
): DocumentationPage {
  return { path, source, routes: new Set(routes) };
}

describe('documentation content validation', () => {
  it('accepts a fully described Stable SDK page with a valid internal route', () => {
    const issues = validateDocumentationPages([
      page(
        'start/install.mdx',
        `---
title: Install Lucid
description: Install the Stable SDK.
status: stable
verifiedVersion: 2.5.0
verifiedAt: 2026-07-20
product: sdk
---

[Continue](/docs/start/install)
`
      ),
    ]);

    expect(issues).toEqual([]);
  });

  it('reports missing release metadata', () => {
    const issues = validateDocumentationPages([
      page(
        'start/install.mdx',
        `---
title: Install Lucid
description: Install the SDK.
---
`
      ),
    ]);

    expect(issues).toContainEqual({
      path: 'start/install.mdx',
      code: 'missing-metadata',
      message: 'Missing frontmatter field: status',
    });
    expect(issues).toContainEqual({
      path: 'start/install.mdx',
      code: 'missing-metadata',
      message: 'Missing frontmatter field: verifiedVersion',
    });
  });

  it('rejects unstable references in Stable pages', () => {
    const issues = validateDocumentationPages([
      page(
        'start/install.mdx',
        `---
title: Install Lucid
status: stable
verifiedVersion: 2.5.0
verifiedAt: 2026-07-20
product: sdk
---

bun add @lucid-agents/next x402-fetch
https://api-lucid-dev.daydreams.systems
`
      ),
    ]);

    expect(issues.map(issue => issue.code)).toEqual([
      'forbidden-stable-reference',
      'forbidden-stable-reference',
      'forbidden-stable-reference',
      'forbidden-current-reference',
    ]);
  });

  it('rejects legacy environment assignments and integer-style prices on current pages', () => {
    const issues = validateDocumentationPages([
      page(
        'start/sell-paid-api.mdx',
        `---
title: Sell
status: next
verifiedVersion: 3.0.0
verifiedAt: 2026-07-20
product: sdk
---

\`\`\`bash
NETWORK=base-sepolia
\`\`\`

\`\`\`ts
const capability = { price: '1000' };
\`\`\`
`
      ),
    ]);

    expect(
      issues.filter(issue => issue.code === 'forbidden-current-reference')
    ).toHaveLength(2);
  });

  it('keeps historical environment examples on Deprecated pages', () => {
    const issues = validateDocumentationPages([
      page(
        'migration-guides/x402-v2.mdx',
        `---
title: Migrate
status: deprecated
verifiedVersion: historical
verifiedAt: 2026-07-20
product: sdk
---

\`\`\`bash
NETWORK=base-sepolia
\`\`\`
`
      ),
    ]);

    expect(issues).toEqual([]);
  });

  it('reports unresolved absolute documentation routes', () => {
    const issues = validateDocumentationPages([
      page(
        'start/install.mdx',
        `---
title: Install Lucid
status: stable
verifiedVersion: 2.5.0
verifiedAt: 2026-07-20
product: sdk
---

[Missing](/docs/does-not-exist)
`
      ),
    ]);

    expect(issues).toContainEqual({
      path: 'start/install.mdx',
      code: 'broken-internal-route',
      message: 'Unknown documentation route: /docs/does-not-exist',
    });
  });

  it('requires Next pages to identify a repository version', () => {
    const issues = validateDocumentationPages([
      page(
        'packages/mpp.mdx',
        `---
title: MPP
status: next
verifiedVersion: unpublished
verifiedAt: 2026-07-20
product: sdk
---
`
      ),
    ]);

    expect(issues).toContainEqual({
      path: 'packages/mpp.mdx',
      code: 'invalid-version',
      message: 'Next pages must use a semver verifiedVersion',
    });
  });

  it('rejects redirect targets that do not resolve and redirect cycles', () => {
    const routes = new Set(['/docs/start']);
    const issues = validateDocumentationRedirects(
      {
        '/docs/old': '/docs/missing',
        '/docs/loop-a': '/docs/loop-b',
        '/docs/loop-b': '/docs/loop-a',
      },
      routes
    );

    expect(issues).toContainEqual({
      path: '/docs/old',
      code: 'broken-redirect',
      message: 'Redirect target does not resolve: /docs/missing',
    });
    expect(issues).toContainEqual({
      path: '/docs/loop-a',
      code: 'redirect-cycle',
      message: 'Redirect cycle detected from /docs/loop-a',
    });
  });
});
