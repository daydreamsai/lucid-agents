import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Bot, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAgents, usePrefetchAgentDetails, isApiError } from '@/api';

export const Route = createFileRoute('/agents')({
  component: AgentsListPage,
});

function AgentsListPage() {
  const { data, isLoading, error } = useAgents();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground text-sm">Manage your AI agents</p>
        </div>
        <Button asChild>
          <Link to="/create">
            <Plus className="size-4" />
            Create Agent
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
          {isApiError(error) ? error.error : 'Failed to load agents'}
        </div>
      )}

      {data && data.agents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No agents yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create your first agent to get started
            </p>
            <Button asChild>
              <Link to="/create">
                <Plus className="size-4" />
                Create Agent
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.agents.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {data && (
        <p className="text-muted-foreground text-sm text-center">
          Showing {data.agents.length} of {data.total} agents
        </p>
      )}
    </div>
  );
}

interface AgentCardProps {
  agent: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    enabled?: boolean;
    entrypoints: Array<{ key: string }>;
  };
}

function AgentCard({ agent }: AgentCardProps) {
  const prefetch = usePrefetchAgentDetails(agent.id);

  return (
    <Link to="/agent/$id" params={{ id: agent.id }} onMouseEnter={prefetch}>
      <Card className="group cursor-pointer transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-primary" />
              <CardTitle className="text-base">{agent.name}</CardTitle>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                agent.enabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {agent.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <CardDescription className="text-xs font-mono">
            {agent.slug}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agent.description && (
            <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
              {agent.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {agent.entrypoints.length} entrypoint
              {agent.entrypoints.length !== 1 ? 's' : ''}
            </span>
            <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
