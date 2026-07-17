import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/agent/.well-known/agent-card.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import('@/lib/agent');
        return handlers.manifest({ request });
      },
    },
  },
});
