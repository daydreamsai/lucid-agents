import { Pencil, Settings, Rocket, DollarSign } from 'lucide-react'
import { LandingSection, SectionHeader } from './landing-container'

const steps = [
  {
    number: '01',
    icon: Pencil,
    title: 'Create',
    description: 'Design your agent with our visual builder. Define capabilities and schemas.',
  },
  {
    number: '02',
    icon: Settings,
    title: 'Configure',
    description: 'Add payments, identity, and access control. Set pricing per entrypoint.',
  },
  {
    number: '03',
    icon: Rocket,
    title: 'Deploy',
    description: 'One-click deployment to our global edge network. Instant availability.',
  },
  {
    number: '04',
    icon: DollarSign,
    title: 'Monetize',
    description: 'Earn from every agent invocation. Track revenue in real-time.',
  },
]

export function HowItWorksSection() {
  return (
    <LandingSection id="how-it-works" className="bg-muted/30">
      <SectionHeader
        title="How it works"
        description="From idea to production in minutes, not weeks."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <div key={step.number} className="relative">
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-5 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-px bg-border" />
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-mono text-sm font-bold">
                    {step.number}
                  </div>
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </LandingSection>
  )
}
