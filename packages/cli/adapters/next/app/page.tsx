import { headers } from 'next/headers';

import Dashboard from '@/components/dashboard';
import { agent, handlers, runtime } from '@/lib/agent';
import type { DashboardData } from '@/lib/dashboard-types';
import type { AgentHealth } from '@/lib/api';

const BASE_PATH = '/api/agent';

function ensureSerializable<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    throw new Error(`Object contains non-serializable values: ${error}`);
  }
}

async function getRequestOrigin(): Promise<string> {
  const headerMap = await headers();
  const proto = headerMap.get('x-forwarded-proto') ?? 'http';
  const host = headerMap.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

type DashboardPayload = {
  dashboard: DashboardData;
  manifestText: string;
  origin: string;
};

function normalizeOrigin(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value instanceof URL) {
    return value.origin;
  }
  if (value && typeof value === 'object') {
    const originProp = (value as { origin?: unknown }).origin;
    if (typeof originProp === 'string' && originProp.length > 0) {
      return originProp;
    }
    if (originProp instanceof URL) {
      return originProp.origin;
    }
  }
  return 'http://localhost:3000';
}

async function loadDashboardPayload(origin: string): Promise<DashboardPayload> {
  const resolvedOrigin = normalizeOrigin(origin);
  const manifest = ensureSerializable(
    agent.resolveManifest(resolvedOrigin, BASE_PATH)
  );
  const manifestEntrypoints = manifest.entrypoints || [];

  const rawEntrypoints = agent.listEntrypoints();
  const entrypoints = rawEntrypoints.map(entry => {
    const manifestEntry = manifestEntrypoints.find(
      (candidate: any) => candidate.key === entry.key
    );

    return {
      key: String(entry.key),
      description: entry.description ? String(entry.description) : null,
      streaming: Boolean(entry.stream),
      price:
        typeof entry.price === 'string'
          ? String(entry.price)
          : entry.price
            ? {
                invoke: entry.price.invoke ? String(entry.price.invoke) : null,
                stream: entry.price.stream ? String(entry.price.stream) : null,
              }
            : null,
      network: entry.network ? String(entry.network) : null,
      inputSchema: manifestEntry?.input || null,
      outputSchema: manifestEntry?.output || null,
    };
  });

  const configPayments = runtime.payments?.config;
  const payments =
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

  const rawMeta = agent.config.meta;
  const meta = rawMeta
    ? {
        name: String(rawMeta.name || ''),
        version: String(rawMeta.version || ''),
        description: rawMeta.description ? String(rawMeta.description) : null,
      }
    : null;

  return {
    dashboard: ensureSerializable({ meta, payments, entrypoints }),
    manifestText: JSON.stringify(manifest, null, 2),
    origin: resolvedOrigin,
  };
}

async function loadInitialHealth(): Promise<AgentHealth | null> {
  if (!handlers.health) return null;
  try {
    const response = await handlers.health(
      new Request('http://agent.local/api/agent/health')
    );
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    return {
      ...(payload as AgentHealth),
      timestamp:
        typeof (payload as AgentHealth).timestamp === 'string'
          ? (payload as AgentHealth).timestamp
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export default async function Page() {
  const origin = await getRequestOrigin();
  const [{ dashboard, manifestText, origin: resolvedOrigin }, initialHealth] =
    await Promise.all([loadDashboardPayload(origin), loadInitialHealth()]);

  return (
    <Dashboard
      initialData={dashboard}
      origin={resolvedOrigin}
      manifestText={manifestText}
      initialHealth={initialHealth}
    />
  );
}
