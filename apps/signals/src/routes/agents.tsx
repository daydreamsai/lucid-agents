import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AgentCard } from '@/components/agent-card';
import { useAgents, isApiError } from '@/api';

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
