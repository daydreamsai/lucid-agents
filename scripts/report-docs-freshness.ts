import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { documentationFreshness, type FreshnessPage } from './docs-maintenance';

const repoRoot = resolve(import.meta.dir, '..');
const docsRoot = join(repoRoot, 'lucid-docs/content/docs');
const maxAgeDays = Number(Bun.env.DOCS_MAX_AGE_DAYS ?? 120);

async function collect(directory: string): Promise<FreshnessPage[]> {
  const pages: FreshnessPage[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...(await collect(path)));
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      pages.push({
        path: relative(docsRoot, path),
        source: await readFile(path, 'utf8'),
      });
    }
  }
  return pages;
}

const records = documentationFreshness(
  await collect(docsRoot),
  new Date(),
  maxAgeDays
);
const stale = records.filter(record => record.stale);
const lines = [
  '# Documentation freshness',
  '',
  `Verified ${records.length} pages; ${stale.length} exceed ${maxAgeDays} days or lack a valid date.`,
  '',
  '| Owner | Page | Verified | Age |',
  '| --- | --- | --- | ---: |',
  ...(stale.length > 0
    ? stale.map(
        record =>
          `| ${record.owner} | \`${record.path}\` | ${record.verifiedAt ?? 'missing'} | ${record.ageDays ?? 'unknown'} |`
      )
    : ['| — | All pages are current | — | — |']),
  '',
];
const report = `${lines.join('\n')}\n`;
console.log(report);

if (Bun.env.GITHUB_STEP_SUMMARY) {
  await appendFile(Bun.env.GITHUB_STEP_SUMMARY, report);
}
