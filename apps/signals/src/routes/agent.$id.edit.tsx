import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Bot, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentForm } from '@/components/agent-form'
import { useAgent, isApiError } from '@/api'

export const Route = createFileRoute('/agent/$id/edit')({
  component: AgentEditPage,
})

function AgentEditPage() {
  const { id } = Route.useParams()
  const { data: agent, isLoading, error } = useAgent(id)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="text-destructive">
          <Bot className="size-12" />
        </div>
        <h2 className="text-lg font-semibold">Agent not found</h2>
        <p className="text-muted-foreground text-sm">
          {isApiError(error) ? error.error : 'Failed to load agent'}
        </p>
        <Button asChild variant="outline">
          <Link to="/agents">Back to Agents</Link>
        </Button>
      </div>
    )
  }

  if (!agent) return null

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/agent/$id" params={{ id }}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Agent</h1>
          <p className="text-muted-foreground text-sm">
            Update {agent.name}'s configuration
          </p>
        </div>
      </div>

      <AgentForm
        mode="edit"
        initialData={agent}
        cancelPath={`/agent/${id}`}
      />
    </div>
  )
}
