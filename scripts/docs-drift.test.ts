import { describe, expect, it } from 'bun:test';

import {
  repositorySourcePaths,
  validateDocumentationNavigation,
  validatePackageReferenceCoverage,
  validateRepositorySourceLinks,
} from './docs-drift';

describe('documentation drift validation', () => {
  it('reports orphaned, unknown, and duplicate navigation entries', () => {
    const issues = validateDocumentationNavigation([
      {
        path: 'docs/start/meta.json',
        available: ['index', 'install', 'sell-paid-api'],
        listed: [
          'index',
          'install',
          'missing-page',
          'install',
          '---Next steps---',
        ],
      },
    ]);

    expect(issues).toEqual([
      {
        path: 'docs/start/meta.json',
        code: 'duplicate-navigation-entry',
        message: 'Navigation entry is listed more than once: install',
      },
      {
        path: 'docs/start/meta.json',
        code: 'orphaned-navigation-entry',
        message: 'Page or group is missing from navigation: sell-paid-api',
      },
      {
        path: 'docs/start/meta.json',
        code: 'unknown-navigation-entry',
        message: 'Navigation points to a missing page or group: missing-page',
      },
    ]);
  });

  it('requires navigation metadata in every documentation directory', () => {
    const issues = validateDocumentationNavigation([
      {
        path: 'lucid-docs/content/docs/new-section/meta.json',
        available: ['index'],
        listed: undefined,
      },
    ]);

    expect(issues).toEqual([
      {
        path: 'lucid-docs/content/docs/new-section/meta.json',
        code: 'missing-navigation-metadata',
        message: 'Documentation directory must define a meta.json pages array',
      },
    ]);
  });

  it('requires reference coverage for every public package', () => {
    const issues = validatePackageReferenceCoverage({
      publicPackages: [
        '@lucid-agents/api-sdk',
        '@lucid-agents/core',
        '@lucid-agents/new-package',
      ],
      referenceSlugs: ['core', 'removed-package'],
      relocatedPackages: {
        'api-sdk': 'products/hosted-platform.mdx',
        'removed-sdk': 'products/removed.mdx',
      },
      documentationPaths: new Set([
        'products/hosted-platform.mdx',
        'products/removed.mdx',
      ]),
    });

    expect(issues).toEqual([
      {
        path: 'packages/new-package/package.json',
        code: 'missing-package-reference',
        message:
          'Public package @lucid-agents/new-package has no package reference or explicit relocation',
      },
      {
        path: 'lucid-docs/content/docs/packages/removed-package.mdx',
        code: 'stale-package-reference',
        message:
          'Package reference has no matching public workspace package: @lucid-agents/removed-package',
      },
      {
        path: 'lucid-docs/content/docs/products/removed.mdx',
        code: 'stale-package-relocation',
        message:
          'Package relocation has no matching public workspace package: @lucid-agents/removed-sdk',
      },
    ]);
  });

  it('requires every package relocation to resolve', () => {
    const issues = validatePackageReferenceCoverage({
      publicPackages: ['@lucid-agents/api-sdk'],
      referenceSlugs: [],
      relocatedPackages: {
        'api-sdk': 'products/hosted-platform.mdx',
      },
      documentationPaths: new Set(),
    });

    expect(issues).toEqual([
      {
        path: 'lucid-docs/content/docs/products/hosted-platform.mdx',
        code: 'missing-package-relocation',
        message:
          'Relocated documentation for @lucid-agents/api-sdk does not exist: products/hosted-platform.mdx',
      },
    ]);
  });

  it('resolves repository-backed source references against the checkout', () => {
    const source = `
[Core source](https://github.com/daydreamsai/lucid-agents/blob/master/packages/core/src/index.ts#L1)

**File:** \`packages/examples/src/missing.ts\`

[External source](https://github.com/example/elsewhere/blob/master/file.ts)
`;

    expect(repositorySourcePaths(source)).toEqual([
      'packages/core/src/index.ts',
      'packages/examples/src/missing.ts',
    ]);
    expect(
      validateRepositorySourceLinks(
        [{ path: 'examples/core.mdx', source }],
        new Set(['packages/core/src/index.ts'])
      )
    ).toEqual([
      {
        path: 'examples/core.mdx',
        code: 'missing-repository-source',
        message:
          'Documented repository source does not exist: packages/examples/src/missing.ts',
      },
    ]);
  });
});
