import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';

export const Route = createFileRoute('/.well-known/agent-card.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runtime } = await import('@/lib/agent');
        const origin = new URL(request.url).origin;
        const manifest = runtime.manifest.build(origin);
        return json(manifest);
      },
    },
  },
});
