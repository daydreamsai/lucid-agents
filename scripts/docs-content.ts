export const DOCUMENTATION_STATUSES = [
  'stable',
  'next',
  'experimental',
  'deprecated',
  'hosted',
] as const;

export const DOCUMENTATION_PRODUCTS = [
  'sdk',
  'router',
  'hosted-platform',
  'provider',
] as const;

export const DOCUMENTATION_PAGE_TYPES = [
  'guide',
  'reference',
  'index',
  'boundary',
] as const;

export type DocumentationPage = {
  path: string;
  source: string;
  routes: ReadonlySet<string>;
  redirectSources?: ReadonlySet<string>;
};

export type DocumentationIssue = {
  path: string;
  code:
    | 'broken-internal-route'
    | 'forbidden-current-reference'
    | 'forbidden-stable-reference'
    | 'invalid-metadata'
    | 'invalid-version'
    | 'missing-metadata'
    | 'redirected-internal-route'
    | 'thin-undesignated-page';
  message: string;
};

export type DocumentationRedirectIssue = {
  path: string;
  code: 'broken-redirect' | 'redirect-cycle';
  message: string;
};

type Frontmatter = Record<string, string>;

const requiredMetadata = [
  'status',
  'verifiedVersion',
  'verifiedAt',
  'product',
] as const;

const stableForbiddenReferences = [
  {
    pattern: /@lucid-agents\/next\b/u,
    label: '@lucid-agents/next',
  },
  {
    pattern: /(?<![@/\w-])x402-fetch(?![\w-])/u,
    label: 'x402-fetch',
  },
  {
    pattern: /https:\/\/api-lucid-dev\.daydreams\.systems\b/u,
    label: 'api-lucid-dev.daydreams.systems',
  },
  {
    pattern: /https:\/\/lucid-dev\.daydreams\.systems\b/u,
    label: 'lucid-dev.daydreams.systems',
  },
] as const;

const currentForbiddenReferences = [
  {
    pattern: /^(?:FACILITATOR_URL|NETWORK|DEFAULT_PRICE)=/mu,
    label: 'a legacy unprefixed payment environment assignment',
  },
  {
    pattern: /\bprice\s*:\s*['"](?:1000|2000)['"]/u,
    label: 'an atomic-unit-style integer price',
  },
  {
    pattern: /from\s+['"]@lucid-agents\/next(?:['"/])/u,
    label: 'the nonexistent @lucid-agents/next package',
  },
  {
    pattern:
      /\bbun\s+add[^\n]*(?<!@\/)(?:x402-fetch|x402-hono|x402-express|x402-next)\b/u,
    label: 'a legacy unscoped x402 dependency',
  },
  {
    pattern: /\bWalletConnectorConfig\b/u,
    label: 'the nonexistent WalletConnectorConfig type',
  },
  {
    pattern: /\.connector\.sign(?:Message|TypedData)\s*\(/u,
    label: 'a nonexistent direct wallet connector signing method',
  },
  {
    pattern:
      /import\s*\{[^}]*\b(?:signChallenge|verifyChallenge)\b[^}]*\}\s*from\s*['"]@lucid-agents\/wallet['"]/u,
    label: 'a nonexistent package-level wallet challenge helper',
  },
  {
    pattern:
      /\bawait\s+(?:identity\.createDomainChallenge|agent\.identity\.signDomainProof|identity\.verifyDomainProof)\b/u,
    label: 'a nonexistent identity instance domain-proof method',
  },
] as const;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(source: string): Frontmatter {
  if (!source.startsWith('---\n')) return {};
  const end = source.indexOf('\n---', 4);
  if (end === -1) return {};
  const result: Frontmatter = {};
  for (const line of source.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) result[key] = unquote(value);
  }
  return result;
}

function documentationBody(source: string): string {
  if (!source.startsWith('---\n')) return source;
  const end = source.indexOf('\n---', 4);
  return end === -1 ? source : source.slice(end + '\n---'.length);
}

function bodyWordCount(source: string): number {
  return documentationBody(source).match(/[\p{L}\p{N}_-]+/gu)?.length ?? 0;
}

function internalDocumentationRoutes(source: string): string[] {
  const routes = new Set<string>();
  const patterns = [
    /\]\((\/docs(?:\/[^\s)#?]*)?)(?:[?#][^\s)]*)?\)/gu,
    /\bhref=["'](\/docs(?:\/[^"'#?]*)?)(?:[?#][^"']*)?["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const route = match[1];
      if (route) routes.add(route.replace(/\/$/u, '') || '/docs');
    }
  }
  return [...routes].sort();
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

export function validateDocumentationPages(
  pages: DocumentationPage[]
): DocumentationIssue[] {
  const issues: DocumentationIssue[] = [];

  for (const page of [...pages].sort((a, b) => a.path.localeCompare(b.path))) {
    const frontmatter = parseFrontmatter(page.source);
    for (const field of requiredMetadata) {
      if (!frontmatter[field]) {
        issues.push({
          path: page.path,
          code: 'missing-metadata',
          message: `Missing frontmatter field: ${field}`,
        });
      }
    }

    const status = frontmatter.status;
    if (
      status &&
      !DOCUMENTATION_STATUSES.includes(
        status as (typeof DOCUMENTATION_STATUSES)[number]
      )
    ) {
      issues.push({
        path: page.path,
        code: 'invalid-metadata',
        message: `Unknown documentation status: ${status}`,
      });
    }

    const product = frontmatter.product;
    if (
      product &&
      !DOCUMENTATION_PRODUCTS.includes(
        product as (typeof DOCUMENTATION_PRODUCTS)[number]
      )
    ) {
      issues.push({
        path: page.path,
        code: 'invalid-metadata',
        message: `Unknown documentation product: ${product}`,
      });
    }

    const pageType = frontmatter.pageType;
    if (
      pageType &&
      !DOCUMENTATION_PAGE_TYPES.includes(
        pageType as (typeof DOCUMENTATION_PAGE_TYPES)[number]
      )
    ) {
      issues.push({
        path: page.path,
        code: 'invalid-metadata',
        message: `Unknown documentation page type: ${pageType}`,
      });
    }

    if (
      bodyWordCount(page.source) < 150 &&
      pageType !== 'index' &&
      pageType !== 'boundary'
    ) {
      issues.push({
        path: page.path,
        code: 'thin-undesignated-page',
        message:
          'Pages under 150 words must be expanded or declared as pageType: index/boundary',
      });
    }

    const verifiedAt = frontmatter.verifiedAt;
    if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/u.test(verifiedAt)) {
      issues.push({
        path: page.path,
        code: 'invalid-metadata',
        message: 'verifiedAt must use YYYY-MM-DD',
      });
    }

    const verifiedVersion = frontmatter.verifiedVersion;
    if (verifiedVersion && status === 'next' && !isSemver(verifiedVersion)) {
      issues.push({
        path: page.path,
        code: 'invalid-version',
        message: 'Next pages must use a semver verifiedVersion',
      });
    }
    if (verifiedVersion && status === 'stable' && !isSemver(verifiedVersion)) {
      issues.push({
        path: page.path,
        code: 'invalid-version',
        message: 'Stable pages must use a semver verifiedVersion',
      });
    }

    if (status === 'stable') {
      for (const forbidden of stableForbiddenReferences) {
        if (forbidden.pattern.test(page.source)) {
          issues.push({
            path: page.path,
            code: 'forbidden-stable-reference',
            message: `Stable page references ${forbidden.label}`,
          });
        }
      }
    }

    if (status && status !== 'deprecated' && status !== 'hosted') {
      for (const forbidden of currentForbiddenReferences) {
        if (forbidden.pattern.test(page.source)) {
          issues.push({
            path: page.path,
            code: 'forbidden-current-reference',
            message: `Current page references ${forbidden.label}`,
          });
        }
      }
    }

    for (const route of internalDocumentationRoutes(page.source)) {
      if (page.redirectSources?.has(route)) {
        issues.push({
          path: page.path,
          code: 'redirected-internal-route',
          message: `Current documentation links through a redirect: ${route}`,
        });
        continue;
      }
      if (!page.routes.has(route)) {
        issues.push({
          path: page.path,
          code: 'broken-internal-route',
          message: `Unknown documentation route: ${route}`,
        });
      }
    }
  }

  return issues;
}

export function validateDocumentationRedirects(
  redirects: Readonly<Record<string, string>>,
  routes: ReadonlySet<string>
): DocumentationRedirectIssue[] {
  const issues: DocumentationRedirectIssue[] = [];

  for (const source of Object.keys(redirects).sort()) {
    const visited = new Set<string>();
    let current = source;
    while (redirects[current]) {
      if (visited.has(current)) {
        issues.push({
          path: source,
          code: 'redirect-cycle',
          message: `Redirect cycle detected from ${source}`,
        });
        break;
      }
      visited.add(current);
      current = redirects[current];
    }
    if (!redirects[current] && !routes.has(current)) {
      issues.push({
        path: source,
        code: 'broken-redirect',
        message: `Redirect target does not resolve: ${current}`,
      });
    }
  }

  return issues;
}
