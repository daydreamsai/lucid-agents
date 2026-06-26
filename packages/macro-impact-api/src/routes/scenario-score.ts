import { seedEvents } from "../data/seed";
import { scoreScenario } from "../logic/scoring";
import { computeFreshness } from "../logic/events";
import { ScenarioRequestSchema } from "../schemas";

export async function postScenarioScoreHandler(c: any) {
  const payload = await c.req.json().catch(() => null);
  const parsed = ScenarioRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return c.json(
      {
        error: { code: "BAD_REQUEST", message: "Invalid request body" },
        freshness: computeFreshness(new Date().toISOString(), 1),
      },
      400,
    );
  }

  return c.json(scoreScenario({ ...parsed.data, events: seedEvents }));
}
