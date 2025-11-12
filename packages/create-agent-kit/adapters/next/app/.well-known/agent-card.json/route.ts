import { unstable_cache } from 'next/cache';
import type { NextRequest } from 'next/server';

import { agent } from '@/lib/agent';

const getCachedManifest = unstable_cache(
  async (origin: string) => agent.resolveManifest(origin, '/api/agent'),
  origin => ['agent-manifest', origin],
  { revalidate: 300, tags: origin => ['agent-manifest', origin] }
);

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const manifest = await getCachedManifest(origin);
  return Response.json(manifest, {
    headers: { 'Cache-Control': 's-maxage=300' },
  });
}
