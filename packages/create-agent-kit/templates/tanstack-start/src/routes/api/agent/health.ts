import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agent/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import("@/lib/agent");
        return handlers.health({ request });
      },
    },
  },
});
