import { seedEvents } from "../data/seed";
import { computeImpactVectors } from "../logic/vectors";
import { computeFreshness } from "../logic/events";
import { ImpactVectorQuerySchema } from "../schemas";

export async function getImpactVectorsHandler(c: any) {
  const parsed = ImpactVectorQuerySchema.safeParse({
    sectorSet: c.req.query("sectorSet") ?? "",
    horizon: c.req.query("horizon") ?? "",
  });

  if (!parsed.success) {
    return c.json(
      {
        error: { code: "BAD_REQUEST", message: "Invalid query parameters" },
        freshness: computeFreshness(new Date().toISOString(), 1),
      },
      400,
    );
  }

  return c.json(computeImpactVectors({ ...parsed.data, events: seedEvents }));
}
