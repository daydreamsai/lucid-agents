import { createFileRoute } from '@tanstack/react-router';

import { handlers } from '@/lib/agent';

export const Route = createFileRoute('/api/agent/entrypoints/$key/invoke')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const key = params.key;
        if (typeof key !== 'string') {
          return new Response('Missing or invalid key parameter', {
            status: 400,
          });
        }
        return handlers.invoke({
          request,
          params: { key },
        });
      },
    },
  },
});
