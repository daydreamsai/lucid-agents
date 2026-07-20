import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import {
  type DocumentationNavigationGroup,
  type DocumentationSourcePage,
  repositorySourcePaths,
  validateDocumentationNavigation,
  validatePackageReferenceCoverage,
  validateRepositorySourceLinks,
} from './docs-drift';

const repoRoot = resolve(import.meta.dir, '..');
const docsRoot = join(repoRoot, 'lucid-docs/content/docs');
const packagesRoot = join(repoRoot, 'packages');

// api-sdk is a public package with a hosted-product lifecycle, so its canonical
// documentation intentionally lives outside the open-source package reference.
const relocatedPackages = {
  'api-sdk': 'products/hosted-platform.mdx',
} as const;

function repoPath(path: string): string {
  return relative(repoRoot, path).split(sep).join('/');
}

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && /\.mdx?$/u.test(entry.name) ? [path] : [];
    })
  );
  return nested.flat().sort();
}

async function documentationDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedDirectories = await Promise.all(
    entries.map(async entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? documentationDirectories(path) : [];
    })
  );
  const nested = nestedDirectories.flat();
  const ownsDocumentation = entries.some(
    entry =>
      entry.isFile() &&
      (entry.name === 'meta.json' || /\.mdx?$/u.test(entry.name))
  );
  return ownsDocumentation || nested.length > 0
    ? [directory, ...nested].sort()
    : [];
}

async function navigationGroup(
  directory: string
): Promise<DocumentationNavigationGroup> {
  const metadataPath = join(directory, 'meta.json');
  let listed: string[] | undefined;
  if (await exists(metadataPath)) {
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
      pages?: unknown;
    };
    if (
      !Array.isArray(metadata.pages) ||
      !metadata.pages.every(page => typeof page === 'string')
    ) {
      throw new Error(
        `${repoPath(metadataPath)} must define a string pages array`
      );
    }
    listed = metadata.pages;
  }

  const available: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.mdx?$/u.test(entry.name)) {
      available.push(entry.name.replace(/\.mdx?$/u, ''));
    }
    if (
      entry.isDirectory() &&
      (await documentationDirectories(join(directory, entry.name))).length > 0
    ) {
      available.push(entry.name);
    }
  }

  return {
    path: repoPath(metadataPath),
    available: available.sort(),
    listed,
  };
}

async function publicWorkspacePackages(): Promise<string[]> {
  const names: string[] = [];
  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(packagesRoot, entry.name, 'package.json');
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      name?: unknown;
      private?: unknown;
    };
    if (
      manifest.private !== true &&
      typeof manifest.name === 'string' &&
      manifest.name.startsWith('@lucid-agents/')
    ) {
      names.push(manifest.name);
    }
  }
  return names.sort();
}

const markdownPaths = await markdownFiles(docsRoot);
const pages: DocumentationSourcePage[] = await Promise.all(
  markdownPaths.map(async path => ({
    path: repoPath(path),
    source: await readFile(path, 'utf8'),
  }))
);
const groups = await Promise.all(
  (await documentationDirectories(docsRoot)).map(navigationGroup)
);
const documentationPaths = new Set(
  markdownPaths.map(path => relative(docsRoot, path).split(sep).join('/'))
);
const packageReferenceSlugs = markdownPaths
  .filter(path => dirname(path) === join(docsRoot, 'packages'))
  .map(path => basename(path).replace(/\.mdx?$/u, ''))
  .filter(slug => slug !== 'index')
  .sort();
const referencedSourcePaths = new Set(
  pages.flatMap(page => repositorySourcePaths(page.source))
);
const existingSourcePaths = new Set<string>();
for (const sourcePath of referencedSourcePaths) {
  const absolutePath = resolve(repoRoot, sourcePath);
  if (
    (absolutePath === repoRoot ||
      absolutePath.startsWith(`${repoRoot}${sep}`)) &&
    (await exists(absolutePath))
  ) {
    existingSourcePaths.add(sourcePath);
  }
}

const issues = [
  ...validateDocumentationNavigation(groups),
  ...validatePackageReferenceCoverage({
    publicPackages: await publicWorkspacePackages(),
    referenceSlugs: packageReferenceSlugs,
    relocatedPackages,
    documentationPaths,
  }),
  ...validateRepositorySourceLinks(pages, existingSourcePaths),
];

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.path}: [${issue.code}] ${issue.message}`);
  }
  throw new Error(
    `Documentation drift validation found ${issues.length} issue(s)`
  );
}

console.log(
  `Verified ${groups.length} navigation groups, ${packageReferenceSlugs.length + Object.keys(relocatedPackages).length} public package documentation targets, and ${referencedSourcePaths.size} repository source references.`
);
