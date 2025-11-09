import { z } from "zod";
import {
  type AgentKitConfig,
  createAxLLMClient,
} from "@lucid-agents/agent-kit";
{{ADAPTER_IMPORTS}}

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

if (!axClient.isConfigured()) {
  console.warn(
    "[examples] Ax LLM provider not configured — falling back to scripted streaming output."
  );
}

{{ADAPTER_CONFIG_OVERRIDES}}

{{ADAPTER_APP_CREATION}}

{{ADAPTER_ENTRYPOINT_REGISTRATION}}

{{ADAPTER_EXPORTS}}
