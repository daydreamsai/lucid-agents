import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/agent/tasks')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlers } = await import('@/lib/agent');
        return handlers.tasks({ request });
      },
    },
  },
});
