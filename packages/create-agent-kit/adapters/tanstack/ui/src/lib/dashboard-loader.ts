import { createServerFn } from "@tanstack/react-start";

export type DashboardEntry = {
  key: string;
  description?: string | null;
  streaming: boolean;
  price?: string | { invoke?: string | null; stream?: string | null } | null;
  network?: string | null;
};

export type AgentPayments = {
  network?: string | null;
  defaultPrice?: string | null;
  payTo?: string | null;
};

export type DashboardData = {
  meta: {
    name: string;
    version: string;
    description?: string | null;
  } | null;
  payments: AgentPayments | null;
  entrypoints: DashboardEntry[];
};

// Helper to create a deep clone that excludes functions
function serializableClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const loadDashboard = createServerFn("GET", async () => {
  "use server";
  // Import agent only inside the server function to avoid serialization
  const { agent } = await import("@/agent");

  // Step 1: Get entrypoints list (this might be causing issues)
  let entrypoints: DashboardEntry[] = [];
  try {
    const rawEntrypoints = agent.listEntrypoints();

    entrypoints = rawEntrypoints.map<DashboardEntry>((entry) => {
      // Explicitly extract only serializable data
      const serializable: DashboardEntry = {
        key: String(entry.key),
        description: entry.description ? String(entry.description) : null,
        streaming: Boolean(entry.stream),
        price:
          typeof entry.price === "string"
            ? String(entry.price)
            : entry.price
            ? {
                invoke: entry.price.invoke ? String(entry.price.invoke) : null,
                stream: entry.price.stream ? String(entry.price.stream) : null,
              }
            : null,
        network: entry.network ? String(entry.network) : null,
      };
      return serializable;
    });
  } catch (error) {
    console.error("[loadDashboard] Error getting entrypoints:", error);
    throw error;
  }

  // Step 2: Get payments config
  let payments: AgentPayments | null = null;
  try {
    const configPayments = agent.config.payments;

    payments =
      configPayments !== false && configPayments !== undefined
        ? {
            network: configPayments.network
              ? String(configPayments.network)
              : null,
            defaultPrice: configPayments.defaultPrice
              ? String(configPayments.defaultPrice)
              : null,
            payTo: configPayments.payTo ? String(configPayments.payTo) : null,
          }
        : null;
  } catch (error) {
    console.error("[loadDashboard] Error getting payments:", error);
    throw error;
  }

  // Step 3: Get meta
  let meta = null;
  try {
    const rawMeta = agent.config.meta;
    // Use JSON parse/stringify to ensure no functions leak through
    meta = rawMeta ? serializableClone(rawMeta) : null;
  } catch (error) {
    console.error("[loadDashboard] Error getting meta:", error);
    throw error;
  }

  // Step 4: Return serializable data - double check with JSON
  const result: DashboardData = {
    meta,
    payments,
    entrypoints,
  };
  // Force JSON serialization to catch any issues
  const serialized = serializableClone(result);
  return serialized;
});
