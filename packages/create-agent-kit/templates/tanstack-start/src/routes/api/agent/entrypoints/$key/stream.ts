import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agent/entrypoints/$key/stream")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handlers } = await import("@/lib/agent");
        return handlers.stream({
          request,
          params: { key: (params as { key: string }).key },
        });
      },
    },
  },
});
