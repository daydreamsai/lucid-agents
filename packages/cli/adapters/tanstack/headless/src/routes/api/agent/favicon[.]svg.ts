import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/agent/favicon.svg')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import('@/lib/agent');
        return handlers.favicon({ request });
      },
    },
  },
});
