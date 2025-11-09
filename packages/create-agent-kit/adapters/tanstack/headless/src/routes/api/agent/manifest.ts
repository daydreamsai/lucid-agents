import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/agent/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlers } = await import("@/agent");
        return handlers.manifest({ request });
      },
    },
  },
});
