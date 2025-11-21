import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/agent/tasks/$taskId/subscribe')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handlers } = await import('@/lib/agent');
        const taskId = params.taskId;
        if (typeof taskId !== 'string') {
          return new Response('Missing or invalid taskId parameter', {
            status: 400,
          });
        }
        return handlers.subscribeTask({
          request,
          params: { taskId },
        });
      },
    },
  },
});
