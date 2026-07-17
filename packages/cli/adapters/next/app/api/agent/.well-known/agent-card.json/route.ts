import type { NextRequest } from 'next/server';

import { handlers } from '@/lib/agent';

export async function GET(request: NextRequest) {
  return handlers.manifest(request);
}
