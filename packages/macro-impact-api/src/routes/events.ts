import { seedEvents } from "../data/seed";
import { computeFreshness, listEvents } from "../logic/events";
import { EventsQuerySchema } from "../schemas";

export async function getEventsHandler(c: any) {
  const parsed = EventsQuerySchema.safeParse({
    eventTypes: c.req.query("eventTypes") ?? undefined,
    geography: c.req.query("geography") ?? undefined,
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

  const eventTypes = parsed.data.eventTypes?.split(",").map((x: string) => x.trim()).filter(Boolean);
  const geography = parsed.data.geography?.split(",").map((x: string) => x.trim()).filter(Boolean);

  const event_feed = listEvents(seedEvents, { eventTypes, geography });
  const avgConfidence = event_feed.length === 0 ? 0.5 : event_feed.reduce((acc, e) => acc + e.severity, 0) / event_feed.length;

  return c.json({
    event_feed,
    freshness: computeFreshness(new Date().toISOString(), avgConfidence),
  });
}
