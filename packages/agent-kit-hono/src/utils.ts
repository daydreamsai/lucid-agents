import { z } from "zod";

export function toJsonSchemaOrUndefined(s?: z.ZodTypeAny) {
  if (!s) return undefined;
  try {
    return z.toJSONSchema(s);
  } catch {
    return undefined;
  }
}
