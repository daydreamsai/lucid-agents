import { createFileRoute } from "@tanstack/react-router";
import { createTanStackPaywall } from "@lucid-agents/agent-kit-tanstack";
import { handlers, runtime } from "@/agent";

const paywall = createTanStackPaywall({
  runtime,
  basePath: "/api/agent",
});

export const Route = createFileRoute("/api/agent/entrypoints/$key/invoke")({
  server: {
    middleware: paywall.invoke ? [paywall.invoke] : [],
    handlers: {
      POST: async ({ request, params }) => {
        const key = (params as { key: string }).key;
        return handlers.invoke({
          request,
          params: { key },
        });
      },
    },
  },
});
