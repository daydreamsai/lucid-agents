import { createFileRoute } from "@tanstack/react-router";
import { createTanStackPaywall } from "@lucid-agents/agent-kit-tanstack";
import { handlers, runtime } from "@/agent";

const paywall = createTanStackPaywall({
  runtime,
  basePath: "/api/agent",
});

export const Route = createFileRoute("/api/agent/entrypoints/$key/stream")({
  server: {
    middleware: paywall.stream ? [paywall.stream] : [],
    handlers: {
      POST: async ({ request, params }) => {
        const key = (params as { key: string }).key;
        return handlers.stream({
          request,
          params: { key },
        });
      },
    },
  },
});
