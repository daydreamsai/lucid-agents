import { createFileRoute } from '@tanstack/react-router';
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

const server = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
});

async function hashSearchQuery(query: string): Promise<string | undefined> {
  const secret = process.env.DOCS_SEARCH_HASH_SALT?.trim();
  if (!secret) return undefined;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(query)
  );
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await server.GET(request);
        const url = new URL(request.url);
        const query = (
          url.searchParams.get('query') ??
          url.searchParams.get('q') ??
          ''
        )
          .trim()
          .toLowerCase();
        if (query) {
          const queryHash = await hashSearchQuery(query);
          const results = await response
            .clone()
            .json()
            .catch(() => undefined);
          const resultCount = Array.isArray(results)
            ? results.length
            : Array.isArray(
                  (results as { results?: unknown[] } | undefined)?.results
                )
              ? (results as { results: unknown[] }).results.length
              : undefined;
          console.info(
            JSON.stringify({
              kind: 'lucid_docs_search',
              occurredAt: new Date().toISOString(),
              ...(queryHash ? { queryHash } : {}),
              queryLength: query.length,
              resultCount,
            })
          );
        }
        return response;
      },
    },
  },
});
