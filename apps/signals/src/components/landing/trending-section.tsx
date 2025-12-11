import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useAgents } from '@/api'
import { AgentCard } from '@/components/agent-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LandingSection, SectionHeader } from './landing-container'

function AgentCardSkeleton() {
  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}

export function TrendingSection() {
  const { data, isLoading } = useAgents({
    limit: 6,
    filterEnabled: true,
  })

  const agents = data?.agents ?? []

  return (
    <LandingSection id="trending">
      <div className="flex items-end justify-between mb-12">
        <SectionHeader
          title="Trending agents"
          description="Discover what others are building on the platform."
          className="mb-0"
        />
        <Button variant="ghost" asChild className="hidden sm:flex">
          <Link to="/dashboard/agents">
            View all agents
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      ) : agents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>No agents available yet. Be the first to create one!</p>
          <Button asChild className="mt-4">
            <Link to="/create">Create Agent</Link>
          </Button>
        </div>
      )}

      <div className="mt-6 sm:hidden">
        <Button variant="outline" asChild className="w-full">
          <Link to="/dashboard/agents">
            View all agents
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </LandingSection>
  )
}
