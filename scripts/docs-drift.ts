export type DocumentationNavigationGroup = {
  path: string;
  available: readonly string[];
  listed: readonly string[] | undefined;
};

export type DocumentationDriftIssue = {
  path: string;
  code:
    | 'duplicate-navigation-entry'
    | 'missing-navigation-metadata'
    | 'missing-package-relocation'
    | 'missing-package-reference'
    | 'missing-repository-source'
    | 'orphaned-navigation-entry'
    | 'stale-package-relocation'
    | 'stale-package-reference'
    | 'unknown-navigation-entry';
  message: string;
};

export type PackageReferenceCoverage = {
  publicPackages: readonly string[];
  referenceSlugs: readonly string[];
  relocatedPackages: Readonly<Record<string, string>>;
  documentationPaths: ReadonlySet<string>;
};

export type DocumentationSourcePage = {
  path: string;
  source: string;
};

function isNavigationSeparator(entry: string): boolean {
  return entry.startsWith('---') && entry.endsWith('---');
}

function sortIssues(
  issues: DocumentationDriftIssue[]
): DocumentationDriftIssue[] {
  return issues.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path) ||
      left.message.localeCompare(right.message)
  );
}

export function validateDocumentationNavigation(
  groups: readonly DocumentationNavigationGroup[]
): DocumentationDriftIssue[] {
  const issues: DocumentationDriftIssue[] = [];

  for (const group of groups) {
    if (!group.listed) {
      issues.push({
        path: group.path,
        code: 'missing-navigation-metadata',
        message: 'Documentation directory must define a meta.json pages array',
      });
      continue;
    }
    const available = new Set(group.available);
    const listed = group.listed.filter(entry => !isNavigationSeparator(entry));
    const seen = new Set<string>();

    for (const entry of listed) {
      if (seen.has(entry)) {
        issues.push({
          path: group.path,
          code: 'duplicate-navigation-entry',
          message: `Navigation entry is listed more than once: ${entry}`,
        });
      }
      seen.add(entry);
    }

    for (const entry of available) {
      if (!seen.has(entry)) {
        issues.push({
          path: group.path,
          code: 'orphaned-navigation-entry',
          message: `Page or group is missing from navigation: ${entry}`,
        });
      }
    }

    for (const entry of seen) {
      if (!available.has(entry)) {
        issues.push({
          path: group.path,
          code: 'unknown-navigation-entry',
          message: `Navigation points to a missing page or group: ${entry}`,
        });
      }
    }
  }

  return sortIssues(issues);
}

export function validatePackageReferenceCoverage({
  publicPackages,
  referenceSlugs,
  relocatedPackages,
  documentationPaths,
}: PackageReferenceCoverage): DocumentationDriftIssue[] {
  const issues: DocumentationDriftIssue[] = [];
  const publicSlugs = new Set(
    publicPackages
      .filter(name => name.startsWith('@lucid-agents/'))
      .map(name => name.slice('@lucid-agents/'.length))
  );
  const references = new Set(referenceSlugs);
  const relocated = new Map(Object.entries(relocatedPackages));

  for (const slug of publicSlugs) {
    if (!references.has(slug) && !relocated.has(slug)) {
      issues.push({
        path: `packages/${slug}/package.json`,
        code: 'missing-package-reference',
        message: `Public package @lucid-agents/${slug} has no package reference or explicit relocation`,
      });
    }
  }

  for (const slug of references) {
    if (!publicSlugs.has(slug)) {
      issues.push({
        path: `lucid-docs/content/docs/packages/${slug}.mdx`,
        code: 'stale-package-reference',
        message: `Package reference has no matching public workspace package: @lucid-agents/${slug}`,
      });
    }
  }

  for (const [slug, documentationPath] of relocated) {
    if (!publicSlugs.has(slug)) {
      issues.push({
        path: `lucid-docs/content/docs/${documentationPath}`,
        code: 'stale-package-relocation',
        message: `Package relocation has no matching public workspace package: @lucid-agents/${slug}`,
      });
    } else if (!documentationPaths.has(documentationPath)) {
      issues.push({
        path: `lucid-docs/content/docs/${documentationPath}`,
        code: 'missing-package-relocation',
        message: `Relocated documentation for @lucid-agents/${slug} does not exist: ${documentationPath}`,
      });
    }
  }

  return sortIssues(issues);
}

function decodeRepositoryPath(value: string): string {
  try {
    return decodeURIComponent(value).replace(/^\.\//u, '');
  } catch {
    return value.replace(/^\.\//u, '');
  }
}

export function repositorySourcePaths(source: string): string[] {
  const paths = new Set<string>();
  const patterns = [
    /https:\/\/github\.com\/daydreamsai\/lucid-agents\/blob\/(?:master|[0-9a-f]{40})\/([^\s)#]+)/giu,
    /\*\*File:\*\*\s*`([^`\n]+)`/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const path = match[1];
      if (path) paths.add(decodeRepositoryPath(path));
    }
  }

  return [...paths].sort();
}

export function validateRepositorySourceLinks(
  pages: readonly DocumentationSourcePage[],
  existingPaths: ReadonlySet<string>
): DocumentationDriftIssue[] {
  const issues: DocumentationDriftIssue[] = [];

  for (const page of pages) {
    for (const sourcePath of repositorySourcePaths(page.source)) {
      if (!existingPaths.has(sourcePath)) {
        issues.push({
          path: page.path,
          code: 'missing-repository-source',
          message: `Documented repository source does not exist: ${sourcePath}`,
        });
      }
    }
  }

  return sortIssues(issues);
}
