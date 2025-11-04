import { z } from "zod";
import type { PaymentsConfig } from "../types";
import { getAgentKitConfig } from "../config";

export function toJsonSchemaOrUndefined(s?: z.ZodTypeAny) {
  if (!s) return undefined;
  try {
    return z.toJSONSchema(s);
  } catch {
    return undefined;
  }
}

export function paymentsFromEnv(params?: {
  defaultPrice?: string;
}): PaymentsConfig {
  const { payments } = getAgentKitConfig();
  return {
    payTo: payments.payTo,
    facilitatorUrl: payments.facilitatorUrl,
    network: payments.network,
    defaultPrice: params?.defaultPrice ?? payments.defaultPrice,
  };
}
