import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agent/entrypoints/$key/invoke")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handlers } = await import("@/lib/agent");
        return handlers.invoke({
          request,
          params: { key: (params as { key: string }).key },
        });
      },
    },
  },
});
