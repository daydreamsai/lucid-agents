import { redirect } from '@tanstack/react-router';
import { createMiddleware } from '@tanstack/react-start';

const AUTH_BASE_URL = process.env.VITE_API_URL ?? 'http://localhost:8787';

export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    // Forward cookies to the hono-runtime auth backend
    const response = await fetch(`${AUTH_BASE_URL}/api/auth/get-session`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });

    const session = await response.json();

    if (!session?.user) {
      throw redirect({ to: '/login' });
    }

    return await next();
  }
);
