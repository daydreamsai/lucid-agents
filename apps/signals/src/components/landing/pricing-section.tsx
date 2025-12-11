import { Check, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { LandingSection, SectionHeader } from './landing-container'
import { cn } from '@/lib/utils'

interface PricingFeature {
  name: string
  free: string | boolean
  pro: string | boolean
  enterprise: string | boolean
}

const features: PricingFeature[] = [
  { name: 'Agents', free: '3', pro: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Entrypoints per agent', free: '5', pro: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Platform fee', free: '5%', pro: '2%', enterprise: 'Custom' },
  { name: 'Analytics', free: 'Basic', pro: 'Advanced', enterprise: 'Custom' },
  { name: 'On-chain Identity', free: false, pro: true, enterprise: true },
  { name: 'A2A Discovery', free: false, pro: true, enterprise: true },
  { name: 'Priority Support', free: false, pro: true, enterprise: true },
  { name: 'Custom Domain', free: false, pro: false, enterprise: true },
  { name: 'SLA', free: false, pro: false, enterprise: '99.9%' },
]

interface PricingTier {
  name: string
  price: string
  period: string
  description: string
  cta: string
  ctaVariant: 'default' | 'outline'
  highlighted: boolean
  tier: 'free' | 'pro' | 'enterprise'
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Perfect for getting started and experimenting.',
    cta: 'Start Free',
    ctaVariant: 'outline',
    highlighted: false,
    tier: 'free',
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For developers building production agents.',
    cta: 'Get Started',
    ctaVariant: 'default',
    highlighted: true,
    tier: 'pro',
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For teams with advanced requirements.',
    cta: 'Contact Sales',
    ctaVariant: 'outline',
    highlighted: false,
    tier: 'enterprise',
  },
]

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="size-4 text-success" />
    ) : (
      <X className="size-4 text-muted-foreground/50" />
    )
  }
  return <span className="text-sm">{value}</span>
}

function PricingCard({ tier }: { tier: PricingTier }) {
  return (
    <Card
      className={cn(
        'relative flex flex-col',
        tier.highlighted && 'border-primary shadow-md'
      )}
    >
      {tier.highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}

      <CardHeader className="space-y-2 pb-4">
        <h3 className="font-semibold text-lg">{tier.name}</h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold">{tier.price}</span>
          <span className="text-muted-foreground">{tier.period}</span>
        </div>
        <p className="text-sm text-muted-foreground">{tier.description}</p>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        {features.map((feature) => (
          <div key={feature.name} className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{feature.name}</span>
            <FeatureValue value={feature[tier.tier]} />
          </div>
        ))}
      </CardContent>

      <CardFooter className="pt-4">
        <Button variant={tier.ctaVariant} className="w-full" asChild>
          <Link to="/signup">{tier.cta}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function PricingSection() {
  return (
    <LandingSection id="pricing">
      <SectionHeader
        title="Simple, transparent pricing"
        description="Start free and scale as you grow. No hidden fees."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <PricingCard key={tier.name} tier={tier} />
        ))}
      </div>
    </LandingSection>
  )
}
