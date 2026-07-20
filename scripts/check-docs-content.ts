import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { docsRedirects } from '../lucid-docs/src/lib/docs-redirects';
import {
  type DocumentationPage,
  validateDocumentationRedirects,
  validateDocumentationPages,
} from './docs-content';

const repoRoot = resolve(import.meta.dir, '..');
const docsRoot = resolve(repoRoot, 'lucid-docs/content/docs');

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

function routeFor(relativePath: string): string {
  const normalized = relativePath
    .split(sep)
    .join('/')
    .replace(/\.mdx?$/u, '');
  const withoutIndex = normalized.replace(/(?:^|\/)index$/u, '');
  return `/docs${withoutIndex ? `/${withoutIndex}` : ''}`;
}

const files = await markdownFiles(docsRoot);
const pageRoutes = new Set(
  files.map(path => routeFor(relative(docsRoot, path)))
);
const routes = new Set(pageRoutes);
for (const route of Object.keys(docsRedirects)) routes.add(route);
const redirectSources = new Set(Object.keys(docsRedirects));

const pages: DocumentationPage[] = await Promise.all(
  files.map(async path => ({
    path: relative(docsRoot, path).split(sep).join('/'),
    source: await readFile(path, 'utf8'),
    routes,
    redirectSources,
  }))
);
const issues = [
  ...validateDocumentationPages(pages),
  ...validateDocumentationRedirects(docsRedirects, pageRoutes),
];

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.path}: [${issue.code}] ${issue.message}`);
  }
  throw new Error(
    `Documentation content validation found ${issues.length} issue(s)`
  );
}

console.log(
  `Verified ${pages.length} documentation pages and ${routes.size} routes.`
);
