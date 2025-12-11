import { Link } from '@tanstack/react-router'
import { ArrowRight, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingSection } from './landing-container'

export function HeroSection() {
  return (
    <LandingSection className="pt-20 md:pt-32">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Left: Text content */}
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground border rounded-full px-3 py-1">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            Now in public beta
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Build, Deploy, and Monetize{' '}
            <span className="text-primary">AI Agents</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-lg">
            The complete platform for creating intelligent agents with built-in
            payments, identity, and agent-to-agent communication.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link to="/signup">
                Start Building Free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="https://docs.lucidagents.dev" target="_blank" rel="noopener noreferrer">
                View Documentation
              </a>
            </Button>
          </div>
        </div>

        {/* Right: Code preview */}
        <div className="relative">
          <div className="bg-card border rounded-lg overflow-hidden">
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/50">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-destructive/60" />
                <span className="size-3 rounded-full bg-chart-1/60" />
                <span className="size-3 rounded-full bg-success/60" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                <Terminal className="size-3" />
                agent.ts
              </div>
            </div>

            {/* Code content */}
            <pre className="p-4 text-sm overflow-x-auto">
              <code className="text-muted-foreground">
{`import { createAgent } from '@lucid-agents/core'
import { http, payments, identity } from '@lucid-agents/extensions'

const agent = createAgent({
  name: 'My AI Agent',
  description: 'Intelligent assistant',
  extensions: [
    http(),
    payments({ payTo: '0x...' }),
    identity({ domain: 'myagent.ai' })
  ]
})

agent.entrypoint('analyze', {
  input: z.object({ data: z.string() }),
  handler: async ({ input }) => {
    // Your AI logic here
    return { result: await analyze(input.data) }
  }
})`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </LandingSection>
  )
}
