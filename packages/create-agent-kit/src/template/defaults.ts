export type TemplateDefaults = Record<string, string>;

export const GLOBAL_TEMPLATE_DEFAULTS: TemplateDefaults = {
  AGENT_VERSION: "0.1.0",
  AGENT_DESCRIPTION: "Starter agent generated with create-agent-kit",
  ENTRYPOINT_KEY: "echo",
  ENTRYPOINT_DESCRIPTION: "Returns text that you send to the agent.",
  PAYMENTS_FACILITATOR_URL: "https://facilitator.daydreams.systems",
  PAYMENTS_PAY_TO: "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
  PAYMENTS_NETWORK: "base-sepolia",
  PAYMENTS_DEFAULT_PRICE: "1000",
};

export function normalizeTemplateDefaults(
  defaults: Record<string, unknown> | undefined
): TemplateDefaults {
  if (!defaults) return {};
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(defaults)) {
    if (value == null) continue;
    entries.push([key, typeof value === "string" ? value : String(value)]);
  }
  return Object.fromEntries(entries);
}

export function resolveTemplateDefaults(
  rawDefaults: Record<string, unknown> | undefined
): TemplateDefaults {
  return {
    ...GLOBAL_TEMPLATE_DEFAULTS,
    ...normalizeTemplateDefaults(rawDefaults),
  };
}
