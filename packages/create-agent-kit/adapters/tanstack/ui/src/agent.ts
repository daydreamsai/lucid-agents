import { createTanStackRuntime } from "@lucid-agents/agent-kit-tanstack";
{{FEATURE_IMPORTS}}

{{FEATURE_PRE_APP}}

const tanstack = createTanStackRuntime(
  {
    name: "{{APP_NAME}}",
    version: "{{AGENT_VERSION}}",
    description: "{{AGENT_DESCRIPTION}}"
  },
  {
    useConfigPayments: true,
    {{FEATURE_AGENT_OPTIONS}}
  }
);

const { runtime, handlers } = tanstack;
const addEntrypoint = runtime.addEntrypoint.bind(runtime);

{{FEATURE_POST_APP}}

{{FEATURE_ENTRYPOINTS}}

{{ADAPTER_ENTRYPOINT_REGISTRATION}}

{{FEATURE_EXPORTS}}

const { agent } = runtime;

export { agent, handlers, runtime };
