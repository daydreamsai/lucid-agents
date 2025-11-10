{{ADAPTER_IMPORTS}}
import { createAxLLMClient } from "@lucid-agents/agent-kit/utils/axllm";

{{ADAPTER_PRE_SETUP}}
// Payment feature + LLM setup
const appOptions = {
  useConfigPayments: true,
  config: {
    payments: {
      facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL,
      payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS,
      network: process.env.PAYMENTS_NETWORK,
      defaultPrice: process.env.PAYMENTS_DEFAULT_PRICE,
    },
  },
};

const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[agent] ${message}`, error);
      } else {
        console.warn(`[agent] ${message}`);
      }
    },
  },
});

if (!axClient.isConfigured()) {
  console.warn(
    "[agent] Ax LLM provider not configured — falling back to scripted output."
  );
}

{{ADAPTER_POST_SETUP}}

