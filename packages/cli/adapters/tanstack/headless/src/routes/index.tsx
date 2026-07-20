import { createFileRoute } from '@tanstack/react-router';

async function loadPublicAgentCard() {
  'use server';
  const { handlers } = await import('@/lib/agent');
  const response = await handlers.manifest({
    request: new Request(
      'http://agent.local/api/agent/.well-known/agent-card.json'
    ),
  });
  if (!response.ok) throw new Error('Agent Card unavailable');
  const card = (await response.json()) as {
    name?: string;
    description?: string;
    version?: string;
  };
  return {
    name: card.name ?? 'Agent API',
    description: card.description ?? 'Headless agent API',
    version: card.version,
  };
}

export const Route = createFileRoute('/')({
  loader: loadPublicAgentCard,
  component: ApiDirectory,
});

function ApiDirectory() {
  const agent = Route.useLoaderData();
  return (
    <article>
      <p>API only</p>
      <h1>{agent.name}</h1>
      <p>{agent.description}</p>
      <dl>
        {agent.version ? (
          <div>
            <dt>Version</dt>
            <dd>{agent.version}</dd>
          </div>
        ) : null}
        <div>
          <dt>Agent Card</dt>
          <dd>
            <a href="/api/agent/.well-known/agent-card.json">Open JSON</a>
          </dd>
        </div>
        <div>
          <dt>Health</dt>
          <dd>
            <a href="/api/agent/health">Check status</a>
          </dd>
        </div>
      </dl>
    </article>
  );
}
