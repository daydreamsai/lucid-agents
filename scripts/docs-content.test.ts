import { describe, expect, it } from 'bun:test';

import {
  type DocumentationPage,
  validateDocumentationRedirects,
  validateDocumentationPages,
} from './docs-content';

function page(
  path: string,
  source: string,
  routes: string[] = ['/docs/start/install'],
  redirectSources: string[] = [],
  padBody = true
): DocumentationPage {
  return {
    path,
    source: padBody
      ? `${source}\n${'Complete task guidance with verified evidence and production failure handling. '.repeat(20)}`
      : source,
    routes: new Set(routes),
    redirectSources: new Set(redirectSources),
  };
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

  it('rejects documented wallet and identity APIs that do not exist', () => {
    const issues = validateDocumentationPages([
      page(
        'packages/wallet.mdx',
        `---
title: Wallet
status: next
verifiedVersion: 0.6.3
verifiedAt: 2026-07-21
product: sdk
---

type Config = WalletConnectorConfig;
await runtime.wallets.agent.connector.signMessage('unsafe');
`
      ),
      page(
        'packages/identity.mdx',
        `---
title: Identity
status: next
verifiedVersion: 3.0.0
verifiedAt: 2026-07-21
product: sdk
---

await identity.createDomainChallenge('agent.example');
`
      ),
    ]);

    expect(
      issues.filter(issue => issue.code === 'forbidden-current-reference')
    ).toHaveLength(3);
  });

  it('requires current pages to link to canonical routes instead of redirects', () => {
    const issues = validateDocumentationPages([
      page(
        'buy/index.mdx',
        `---
title: Buy
status: next
verifiedVersion: 3.0.0
verifiedAt: 2026-07-21
product: sdk
---

[Policy](/docs/examples/payment-policies)
`,
        ['/docs/examples/payment-policies', '/docs/buy/policies-budgets'],
        ['/docs/examples/payment-policies']
      ),
    ]);

    expect(issues).toContainEqual({
      path: 'buy/index.mdx',
      code: 'redirected-internal-route',
      message:
        'Current documentation links through a redirect: /docs/examples/payment-policies',
    });
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

  it('requires a short page to declare an intentional index or boundary', () => {
    const issues = validateDocumentationPages([
      page(
        'build/thin-guide.mdx',
        `---
title: Thin guide
status: next
verifiedVersion: 3.0.0
verifiedAt: 2026-07-21
product: sdk
---

This destination does not yet explain the complete task.
`,
        [],
        [],
        false
      ),
    ]);

    expect(issues).toContainEqual({
      path: 'build/thin-guide.mdx',
      code: 'thin-undesignated-page',
      message:
        'Pages under 150 words must be expanded or declared as pageType: index/boundary',
    });
  });

  it('accepts intentionally short index and boundary pages', () => {
    const issues = validateDocumentationPages([
      page(
        'build/index.mdx',
        `---
title: Build
status: next
verifiedVersion: 3.0.0
verifiedAt: 2026-07-21
product: sdk
pageType: index
---

Choose a complete guide.
`,
        [],
        [],
        false
      ),
      page(
        'products/unavailable.mdx',
        `---
title: Unavailable product
status: hosted
verifiedVersion: unversioned
verifiedAt: 2026-07-21
product: hosted-platform
pageType: boundary
---

There is no public product contract.
`,
        [],
        [],
        false
      ),
    ]);

    expect(issues).toEqual([]);
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
