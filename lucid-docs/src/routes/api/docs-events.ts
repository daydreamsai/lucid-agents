import { createFileRoute } from '@tanstack/react-router';

import { isDocsEvent } from '@/lib/docs-telemetry';

export const Route = createFileRoute('/api/docs-events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => undefined);
        if (!isDocsEvent(body)) {
          return Response.json(
            { error: 'Invalid documentation event' },
            { status: 400 }
          );
        }
        console.info(
          JSON.stringify({
            kind: 'lucid_docs_event',
            occurredAt: new Date().toISOString(),
            ...body,
          })
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
