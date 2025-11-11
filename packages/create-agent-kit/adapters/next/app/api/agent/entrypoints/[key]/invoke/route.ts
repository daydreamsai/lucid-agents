import type { NextRequest } from 'next/server';

import { handlers } from '@/lib/agent';

type RouteContext = {
  params: Promise<{
    key?: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { key } = await context.params;
  if (typeof key !== 'string' || key.length === 0) {
    return new Response('Missing or invalid key parameter', { status: 400 });
  }
  return handlers.invoke(request, { key });
}
