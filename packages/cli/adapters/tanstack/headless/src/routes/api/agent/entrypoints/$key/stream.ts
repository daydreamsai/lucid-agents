import { createFileRoute } from '@tanstack/react-router';
import { handlers } from '@/lib/agent';

export const Route = createFileRoute('/api/agent/entrypoints/$key/stream')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const key = (params as { key: string }).key;
        return handlers.stream({
          request,
          params: { key },
        });
      },
    },
  },
});
