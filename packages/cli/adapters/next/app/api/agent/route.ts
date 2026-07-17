import type { NextRequest } from 'next/server';

import { handlers } from '@/lib/agent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return (
    (await handlers.landing?.(request)) ??
    Response.json(
      { error: { code: 'not_found', message: 'Landing page is disabled' } },
      { status: 404 }
    )
  );
}
