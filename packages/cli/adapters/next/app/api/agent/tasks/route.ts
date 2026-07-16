import type { NextRequest } from 'next/server';

import { handlers } from '@/lib/agent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handlers.tasks(request);
}

export async function GET(request: NextRequest) {
  return handlers.listTasks(request);
}
