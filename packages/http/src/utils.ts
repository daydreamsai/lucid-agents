/**
 * Helper functions for HTTP request/response handling
 */

export const jsonResponse = (
  payload: unknown,
  init?: ConstructorParameters<typeof Response>[1]
): Response => {
  const body = JSON.stringify(payload);
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(body, { ...init, headers });
};

export const errorResponse = (
  code: string,
  status: number,
  details?: unknown
): Response => {
  return jsonResponse(
    {
      error: {
        code,
        ...(details ? { details } : {}),
      },
    },
    { status }
  );
};

export const readJson = async (req: Request): Promise<unknown> => {
  try {
    return await req.clone().json();
  } catch {
    return undefined;
  }
};

export const extractInput = (payload: unknown): unknown => {
  if (payload && typeof payload === 'object' && 'input' in payload) {
    const { input } = payload as { input?: unknown };
    return input ?? {};
  }
  return payload ?? {};
};

/**
 * Normalizes the origin from a request, accounting for reverse proxy headers.
 * When behind a reverse proxy (nginx, Cloudflare, etc.), the request URL may be
 * http://localhost:3000 even though the client accessed it via https://agent.example.com.
 *
 * This function checks X-Forwarded-Proto and X-Forwarded-Host headers to determine
 * the correct public origin.
 *
 * @param req - The incoming Request object
 * @returns Normalized origin string (e.g., "https://agent.example.com")
 */
export function normalizeOrigin(req: Request): string {
  const url = new URL(req.url);
  let protocol = url.protocol;
  let host = url.host;

  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto === 'https') {
    protocol = 'https:';
  } else if (forwardedProto === 'http') {
    protocol = 'http:';
  }

  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    host = forwardedHost;
  }

  if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
    return url.origin;
  }

  return `${protocol}//${host}`;
}
