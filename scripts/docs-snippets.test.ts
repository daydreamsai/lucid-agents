import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '..');
const docsRoot = join(repoRoot, 'lucid-docs');

function titledSnippet(source: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = new RegExp(
    '```(?:ts|typescript) title=["\']' + escaped + '["\']\\n([\\s\\S]*?)\\n```',
    'u'
  ).exec(source);
  if (!match?.[1]) throw new Error(`Missing tested snippet: ${title}`);
  return match[1].trim();
}

describe('high-risk documentation snippets', () => {
  it('embeds the exact compiled seller and buyer sources in the Stable quickstart', async () => {
    const guide = await readFile(
      join(docsRoot, 'content/docs/start/sell-paid-api.mdx'),
      'utf8'
    );
    for (const file of ['paid-service.ts', 'buyer-client.ts', 'buyer.ts']) {
      const fixture = await readFile(join(docsRoot, 'examples', file), 'utf8');
      expect(titledSnippet(guide, file)).toBe(fixture.trim());
    }
  });

  it('renders the compiled seller fixture on the marketing homepage', async () => {
    const homepage = await readFile(
      join(docsRoot, 'src/routes/index.tsx'),
      'utf8'
    );
    expect(homepage).toContain(
      "import paidServiceExample from '../../examples/paid-service.ts?raw';"
    );
    expect(homepage).toContain('Compiled in CI');
  });
});
