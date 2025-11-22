import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';

export const Route = createFileRoute('/.well-known/agent-card.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runtime } = await import('@/lib/agent');
        const origin = new URL(request.url).origin;
        // Since this route is at /.well-known/agent-card.json, basePath should be empty
        // If you want it to reference /api/agent endpoints, use "/api/agent"
        const manifest = runtime.manifest.build(origin);
        return json(manifest);
      },
    },
  },
});
