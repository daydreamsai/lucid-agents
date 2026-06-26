import type { MacroEvent } from "../schemas";

const now = Date.now();

export const seedEvents: MacroEvent[] = [
  {
    id: "evt-fed-2026-01",
    type: "rate-decision",
    geography: "US",
    timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    severity: 0.9,
    surprise: -0.2,
    title: "FOMC cuts policy rate by 25 bps",
  },
  {
    id: "evt-cpi-2026-01",
    type: "cpi",
    geography: "US",
    timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
    severity: 0.85,
    surprise: -0.15,
    title: "US CPI prints below consensus",
  },
  {
    id: "evt-gdp-2025-q4",
    type: "gdp",
    geography: "EU",
    timestamp: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
    severity: 0.7,
    surprise: 0.1,
    title: "Euro area GDP growth revised higher",
  },
  {
    id: "evt-geo-redsea-2026-02",
    type: "geopolitical",
    geography: "Global",
    timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
    severity: 0.8,
    surprise: 0.25,
    title: "Shipping disruptions elevate supply-chain risk",
  },
];
