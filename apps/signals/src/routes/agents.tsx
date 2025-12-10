import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentGrid } from '@/components/agent-grid';
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

      <AgentGrid
        agents={data?.agents ?? []}
        total={data?.total}
        isLoading={isLoading}
        error={error ? (isApiError(error) ? error.error : 'Failed to load agents') : null}
      />
    </div>
  );
}
