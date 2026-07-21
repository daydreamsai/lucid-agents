import {
  buildServicePageModel,
  type ServicePageHealthInput,
} from '@lucid-agents/http';
import { createFileRoute } from '@tanstack/react-router';

import { ServiceStorefront } from '@/components/service-storefront';
import serviceUi from '../../service-ui.config';

async function loadPublicService() {
  'use server';
  const { handlers } = await import('@/lib/agent');
  const baseUrl = '/api/agent';
  const [manifestResponse, healthResponse] = await Promise.all([
    handlers.manifest({
      request: new Request(
        `http://agent.local${baseUrl}/.well-known/agent-card.json`
      ),
    }),
    handlers.health({
      request: new Request(`http://agent.local${baseUrl}/health`),
    }),
  ]);
  if (!manifestResponse.ok) throw new Error('Agent Card unavailable');
  const manifest = await manifestResponse.json();
  const health = healthResponse.ok ? await healthResponse.json() : null;
  return {
    manifest,
    service: buildServicePageModel(
      manifest as Parameters<typeof buildServicePageModel>[0],
      {
        baseUrl,
        health: health as ServicePageHealthInput,
      }
    ),
  };
}

export const Route = createFileRoute('/')({
  loader: loadPublicService,
  component: AgentServicePage,
});

function AgentServicePage() {
  const { manifest, service } = Route.useLoaderData();
  return (
    <ServiceStorefront
      service={service}
      manifest={manifest}
      serviceUi={serviceUi}
    />
  );
}
