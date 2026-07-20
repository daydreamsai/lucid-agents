import { headers } from 'next/headers';
import {
  buildServicePageModel,
  type ServicePageHealthInput,
} from '@lucid-agents/http';

import { ServiceStorefront } from '@/components/service-storefront';
import { handlers } from '@/lib/agent';

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

async function loadPublicService(origin: string) {
  const baseUrl = `${origin}${BASE_PATH}`;
  try {
    const [manifestResponse, healthResponse] = await Promise.all([
      handlers.manifest(new Request(`${baseUrl}/.well-known/agent-card.json`)),
      handlers.health(new Request(`${baseUrl}/health`)),
    ]);
    if (!manifestResponse.ok) throw new Error('Agent Card unavailable');
    const manifest = ensureSerializable(await manifestResponse.json());
    const health = healthResponse.ok
      ? ensureSerializable(await healthResponse.json())
      : null;
    const service = buildServicePageModel(
      manifest as Parameters<typeof buildServicePageModel>[0],
      { baseUrl, health: health as ServicePageHealthInput }
    );
    return { manifest, service: ensureSerializable(service) };
  } catch (error) {
    throw new Error(
      `Unable to load the public agent service: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export default async function Page() {
  const origin = await getRequestOrigin();
  const { manifest, service } = await loadPublicService(origin);
  return <ServiceStorefront service={service} manifest={manifest} />;
}
