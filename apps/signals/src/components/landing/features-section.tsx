import {
  Zap,
  Wallet,
  Fingerprint,
  Network,
  Code,
  BarChart3,
  Shield,
  Globe,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { LandingSection, SectionHeader } from './landing-container'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const features: Feature[] = [
  {
    icon: Zap,
    title: 'Visual Agent Builder',
    description: 'Design agents with a drag-and-drop interface. Define entrypoints, schemas, and handlers visually.',
  },
  {
    icon: Wallet,
    title: 'Built-in Payments',
    description: 'x402 protocol with USDC support on Base, Ethereum, and Solana. Monetize every invocation.',
  },
  {
    icon: Fingerprint,
    title: 'On-Chain Identity',
    description: 'ERC-8004 compliant identity binding. Verify and authenticate your agents on-chain.',
  },
  {
    icon: Network,
    title: 'Agent-to-Agent (A2A)',
    description: 'Discover and communicate with other agents via standardized Agent Cards.',
  },
  {
    icon: Code,
    title: 'Flexible Handlers',
    description: 'Write custom JavaScript, use built-in handlers, or proxy to external URLs.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboard',
    description: 'Track transactions, usage patterns, and revenue. Export data in CSV or JSON.',
  },
  {
    icon: Shield,
    title: 'Access Control',
    description: 'Configure payment policies, rate limits, and access rules per entrypoint.',
  },
  {
    icon: Globe,
    title: 'Multi-Network Support',
    description: 'Deploy across EVM chains and Solana. Manage wallets for multiple networks.',
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardContent className="p-0 space-y-3">
        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="size-5 text-primary" />
        </div>
        <h3 className="font-semibold">{feature.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {feature.description}
        </p>
      </CardContent>
    </Card>
  )
}

export function FeaturesSection() {
  return (
    <LandingSection id="features">
      <SectionHeader
        title="Everything you need to build AI agents"
        description="A complete toolkit for creating, deploying, and monetizing intelligent agents."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </LandingSection>
  )
}
