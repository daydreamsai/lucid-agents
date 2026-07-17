import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/agent/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import('@/lib/agent');
        return (
          (await handlers.landing?.({ request })) ??
          Response.json(
            {
              error: {
                code: 'not_found',
                message: 'Landing page is disabled',
              },
            },
            { status: 404 }
          )
        );
      },
    },
  },
});
