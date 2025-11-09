import { z } from "zod";
import {
  type AgentKitConfig,
  createAxLLMClient,
} from "@lucid-agents/agent-kit";
{{ADAPTER_IMPORTS}}
import { flow } from "@ax-llm/ax";

const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[examples] ${message}`, error);
      } else {
        console.warn(`[examples] ${message}`);
      }
    },
  },
});

{{ADAPTER_CONFIG_OVERRIDES}}

{{ADAPTER_APP_CREATION}}

{{ADAPTER_ENTRYPOINT_REGISTRATION}}

{{ADAPTER_EXPORTS}}
