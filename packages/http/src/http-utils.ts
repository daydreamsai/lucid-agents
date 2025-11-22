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

