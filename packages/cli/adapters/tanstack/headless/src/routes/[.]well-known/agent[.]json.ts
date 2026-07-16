import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/.well-known/agent.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import('@/lib/agent');
        return handlers.manifest({ request });
      },
    },
  },
});
