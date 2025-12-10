import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentForm } from '@/components/agent-form'

export const Route = createFileRoute('/create')({
  component: AgentCreatePage,
})

function AgentCreatePage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Agent</h1>
          <p className="text-muted-foreground text-sm">
            Define your agent and its entrypoints
          </p>
        </div>
      </div>

      <AgentForm mode="create" cancelPath="/" />
    </div>
  )
}
