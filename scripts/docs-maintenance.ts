export type FreshnessPage = {
  path: string;
  source: string;
};

export type FreshnessRecord = {
  path: string;
  owner: string;
  verifiedAt?: string;
  ageDays?: number;
  stale: boolean;
};

function frontmatterValue(source: string, field: string): string | undefined {
  if (!source.startsWith('---\n')) return undefined;
  const end = source.indexOf('\n---', 4);
  if (end === -1) return undefined;
  const pattern = new RegExp(`^${field}:\\s*(.+)$`, 'mu');
  const value = pattern.exec(source.slice(4, end))?.[1]?.trim();
  if (!value) return undefined;
  return value.replace(/^(['"])(.*)\1$/u, '$2');
}

export function documentationOwner(path: string): string {
  if (path.startsWith('products/')) return 'Hosted product owner';
  if (path.startsWith('migration-guides/')) return 'Release owner';
  if (path.startsWith('packages/')) {
    const packageName = path.split('/')[1]?.replace(/\.mdx$/u, '') ?? 'index';
    return packageName === 'index'
      ? 'SDK lead'
      : `Package owner: @lucid-agents/${packageName}`;
  }
  if (
    path.startsWith('buy/') ||
    path === 'protocols/x402.mdx' ||
    path === 'protocols/siwx.mdx'
  ) {
    return 'Payments owner';
  }
  if (path.startsWith('operate/')) return 'Runtime operations owner';
  if (path.startsWith('protocols/')) return 'Protocol package owner';
  if (path.startsWith('examples/')) return 'SDK/DX owner';
  return 'Product/DX owner';
}

export function documentationFreshness(
  pages: FreshnessPage[],
  now: Date,
  maxAgeDays: number
): FreshnessRecord[] {
  const millisecondsPerDay = 86_400_000;
  return pages
    .map(page => {
      const verifiedAt = frontmatterValue(page.source, 'verifiedAt');
      const timestamp = verifiedAt
        ? Date.parse(`${verifiedAt}T00:00:00.000Z`)
        : Number.NaN;
      const ageDays = Number.isFinite(timestamp)
        ? Math.floor((now.getTime() - timestamp) / millisecondsPerDay)
        : undefined;
      return {
        path: page.path,
        owner: documentationOwner(page.path),
        verifiedAt,
        ageDays,
        stale: ageDays === undefined || ageDays > maxAgeDays,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function externalDocumentationLinks(source: string): string[] {
  const links = new Set<string>();
  const patterns = [
    /\]\((https?:\/\/[^\s)]+)\)/gu,
    /\bhref=["'](https?:\/\/[^"']+)["']/gu,
    /<(https?:\/\/[^>]+)>/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) links.add(match[1]);
    }
  }
  return [...links].sort();
}

export function isCheckableExternalLink(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (
      host === 'localhost' ||
      host.endsWith('.example') ||
      host.includes('your_') ||
      value.includes('{') ||
      value.includes('YOUR_')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
