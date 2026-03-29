import type { Freshness, MacroEvent } from "../schemas";

export function computeFreshness(fetchedAt: string, confidence: number, nowMs = Date.now()): Freshness {
  const fetchedMs = Date.parse(fetchedAt);
  const staleness = Math.max(0, Math.floor((nowMs - fetchedMs) / 1000));
  const boundedConfidence = Math.max(0, Math.min(1, confidence));
  return { fetchedAt, staleness, confidence: boundedConfidence };
}

export function listEvents(
  events: MacroEvent[],
  filters: {
    eventTypes?: string[];
    geography?: string[];
  },
): MacroEvent[] {
  const out = events.filter((event) => {
    const eventTypeMatch = !filters.eventTypes || filters.eventTypes.length === 0 || filters.eventTypes.includes(event.type);
    const geographyMatch = !filters.geography || filters.geography.length === 0 || filters.geography.includes(event.geography);
    return eventTypeMatch && geographyMatch;
  });

  out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return out;
}
