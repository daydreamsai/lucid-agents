import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import {
  externalDocumentationLinks,
  isCheckableExternalLink,
} from './docs-maintenance';

const repoRoot = resolve(import.meta.dir, '..');
const roots = [
  join(repoRoot, 'lucid-docs/content/docs'),
  join(repoRoot, 'lucid-docs/src/routes'),
];
const allowlist = JSON.parse(
  await readFile(join(repoRoot, 'docs/external-links-allowlist.json'), 'utf8')
) as Record<string, string>;

type LinkSource = { url: string; sources: Set<string> };

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    if (entry.isFile() && /\.(?:mdx|tsx?)$/u.test(entry.name))
      result.push(path);
  }
  return result;
}

const links = new Map<string, LinkSource>();
for (const root of roots) {
  for (const path of await files(root)) {
    const source = await readFile(path, 'utf8');
    for (const url of externalDocumentationLinks(source)) {
      if (!isCheckableExternalLink(url) || allowlist[url]) continue;
      const record = links.get(url) ?? { url, sources: new Set<string>() };
      record.sources.add(relative(repoRoot, path));
      links.set(url, record);
    }
  }
}

async function request(url: string): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      let response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
        headers: { 'user-agent': 'Lucid-Docs-Link-Check/1.0' },
      });
      if ([400, 404, 405, 501].includes(response.status)) {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(12_000),
          headers: {
            'user-agent': 'Lucid-Docs-Link-Check/1.0',
            range: 'bytes=0-1024',
          },
        });
      }
      if (
        (response.status >= 200 && response.status < 400) ||
        [401, 403, 429].includes(response.status)
      ) {
        return response.status;
      }
      if (attempt === 3) return response.status;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  return 0;
}

const failures: string[] = [];
const queue = [...links.values()].sort((a, b) => a.url.localeCompare(b.url));
const concurrency = 8;
for (let index = 0; index < queue.length; index += concurrency) {
  await Promise.all(
    queue.slice(index, index + concurrency).map(async link => {
      try {
        const status = await request(link.url);
        if (
          status < 200 ||
          (status >= 400 && ![401, 403, 429].includes(status))
        ) {
          failures.push(
            `${link.url} returned ${status} (${[...link.sources].join(', ')})`
          );
        }
      } catch (error) {
        failures.push(
          `${link.url} failed: ${(error as Error).message} (${[...link.sources].join(', ')})`
        );
      }
    })
  );
}

if (failures.length > 0) {
  throw new Error(
    `External documentation links failed:\n${failures.sort().join('\n')}`
  );
}
console.log(
  `Verified ${queue.length} external links; skipped ${Object.keys(allowlist).length} allowlisted URLs.`
);
