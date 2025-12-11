import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingSection } from './landing-container'

export function CTASection() {
  return (
    <LandingSection className="border-t">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left: Text */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">
            Ready to build your first agent?
          </h2>
          <p className="text-muted-foreground text-lg">
            Join developers building the future of AI. Start free, scale when you're ready.
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
          <Button size="lg" asChild>
            <Link to="/signup">
              Get Started Free
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="mailto:sales@lucidagents.dev">Talk to Sales</a>
          </Button>
        </div>
      </div>
    </LandingSection>
  )
}
