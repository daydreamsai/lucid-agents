import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agent/entrypoints")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import("@/agent");
        return handlers.entrypoints({ request });
      },
    },
  },
});
