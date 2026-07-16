import type { NextRequest } from 'next/server';

import { handlers } from '@/lib/agent';

type RouteContext = { params: Promise<{ taskId?: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { taskId } = await context.params;
  if (!taskId) {
    return new Response('Missing or invalid taskId parameter', { status: 400 });
  }
  return handlers.subscribeTask(request, { taskId });
}
