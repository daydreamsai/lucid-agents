import { Link } from '@tanstack/react-router';
import { Bot, Loader2, Plus } from 'lucide-react';
import { AgentCard, type AgentCardProps } from './agent-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface AgentGridProps {
  agents: AgentCardProps['agent'][];
  total?: number;
  isLoading?: boolean;
  error?: string | null;
  showCount?: boolean;
  emptyState?: {
    title?: string;
    description?: string;
    showCreateButton?: boolean;
  };
}

export function AgentGrid({
  agents,
  total,
  isLoading,
  error,
  showCount = true,
  emptyState = {},
}: AgentGridProps) {
  const {
    title = 'No agents yet',
    description = 'Create your first agent to get started',
    showCreateButton = true,
  } = emptyState;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Bot className="size-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm mb-4">{description}</p>
          {showCreateButton && (
            <Button asChild>
              <Link to="/create">
                <Plus className="size-4" />
                Create Agent
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const displayTotal = total ?? agents.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      {showCount && (
        <p className="text-muted-foreground text-sm text-center">
          Showing {agents.length} of {displayTotal} agent
          {displayTotal !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
