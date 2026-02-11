import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/.well-known/oasf-record.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runtime } = await import('@/lib/agent');
        if (runtime.handlers?.oasf) {
          return runtime.handlers.oasf(request);
        }

        return new Response(
          JSON.stringify({
            error: {
              code: 'not_found',
              message: 'OASF record is not enabled',
            },
          }),
          {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }
        );
      },
    },
  },
});
