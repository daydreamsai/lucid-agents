import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/.well-known/oasf-record.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runtime } = await import('@/lib/agent');
        return runtime.handlers!.oasf(request);
      },
    },
  },
});
