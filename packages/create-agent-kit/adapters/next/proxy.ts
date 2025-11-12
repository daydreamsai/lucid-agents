import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { runtime } from '@/lib/agent';
import { createNextPaywall } from '@/lib/paywall';

const PAYWALL_BASE_PATH = '/api/agent';
const ROUTE_MATCHER = ['/api/agent/entrypoints/:path*'];

const paywall = createNextPaywall({
  runtime,
  basePath: PAYWALL_BASE_PATH,
});

export const config = {
  matcher: ROUTE_MATCHER,
};

export function proxy(request: NextRequest) {
  if (paywall.middleware) {
    return paywall.middleware(request);
  }
  return NextResponse.next();
}
