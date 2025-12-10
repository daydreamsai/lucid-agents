import { Link } from '@tanstack/react-router'
import { Bot, ChevronRight } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { usePrefetchAgentDetails } from '@/api'

export interface AgentCardProps {
  agent: {
    id: string
    name: string
    slug: string
    description?: string
    enabled?: boolean
    entrypoints: Array<{ key: string }>
  }
}

export function AgentCard({ agent }: AgentCardProps) {
  const prefetch = usePrefetchAgentDetails(agent.id)

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
  )
}
