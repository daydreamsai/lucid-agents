import { Link } from '@tanstack/react-router'
import { Zap, DollarSign, Copy, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { usePrefetchAgentDetails } from '@/api'

export interface AgentCardProps {
  agent: {
    id: string
    name: string
    slug: string
    description?: string
    enabled?: boolean
    entrypoints: Array<{ key: string; price?: string }>
  }
}

export function AgentCard({ agent }: AgentCardProps) {
  const prefetch = usePrefetchAgentDetails(agent.id)

  // Calculate price range from entrypoints
  const prices = agent.entrypoints
    .map((ep) => ep.price)
    .filter((p): p is string => !!p && p !== '0')
    .map((p) => parseFloat(p))
    .filter((p) => !isNaN(p) && p > 0)

  const minPrice = prices.length > 0 ? Math.min(...prices) : null
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null
  const hasPricing = minPrice !== null

  // Build agent URL
  const agentUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/agent/${agent.id}`
      : `/agent/${agent.id}`

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(agentUrl)
  }

  const handleOpenUrl = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(agentUrl, '_blank')
  }

  return (
    <Card
      className={`group transition-all hover:shadow-md border-l-4 ${
        agent.enabled
          ? 'border-l-success'
          : 'border-l-muted-foreground/30'
      }`}
    >
      <Link to="/agent/$id" params={{ id: agent.id }} onMouseEnter={prefetch}>
        <CardContent className="p-4 cursor-pointer">
          {/* Primary: Name + Status */}
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`size-2 rounded-full flex-shrink-0 ${
                agent.enabled
                  ? 'bg-success'
                  : 'bg-muted-foreground/50'
              }`}
            />
            <h3 className="font-semibold text-base truncate">{agent.name}</h3>
            <span
              className={`ml-auto text-xs flex-shrink-0 ${
                agent.enabled
                  ? 'text-success'
                  : 'text-muted-foreground'
              }`}
            >
              {agent.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>

          {/* Secondary: Slug */}
          <p className="text-xs text-muted-foreground font-mono mb-3">
            {agent.slug}
          </p>

          {/* Tertiary: Description */}
          {agent.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
              {agent.description}
            </p>
          )}

          {/* Footer: Entrypoints + Price */}
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Zap className="size-3.5 flex-shrink-0" />
              {/* Default: show count */}
              <span className="text-xs group-hover:hidden">
                {agent.entrypoints.length} entrypoint
                {agent.entrypoints.length !== 1 ? 's' : ''}
              </span>
              {/* Hover: show entrypoint names */}
              <div className="hidden group-hover:flex items-center gap-1 flex-wrap">
                {agent.entrypoints.slice(0, 3).map((ep) => (
                  <span
                    key={ep.key}
                    className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
                  >
                    {ep.key}
                  </span>
                ))}
                {agent.entrypoints.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{agent.entrypoints.length - 3}
                  </span>
                )}
              </div>
            </div>

            {/* Price badge */}
            {hasPricing && (
              <div className="flex items-center gap-1 text-xs">
                <DollarSign className="size-3" />
                <span>
                  {minPrice === maxPrice
                    ? `${minPrice.toFixed(2)}`
                    : `${minPrice!.toFixed(2)} - ${maxPrice!.toFixed(2)}`}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Link>

      {/* URL Button Group */}
      <div className="px-4 pb-4 pt-0">
        <ButtonGroup className="w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 justify-start font-mono text-xs truncate"
            onClick={handleOpenUrl}
          >
            <span className="truncate">{agentUrl}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyUrl}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenUrl}>
            <ExternalLink className="size-3.5" />
          </Button>
        </ButtonGroup>
      </div>
    </Card>
  )
}
