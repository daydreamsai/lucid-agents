import { createFileRoute } from '@tanstack/react-router'
import {
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  PricingSection,
  ComparisonSection,
  TrendingSection,
  CTASection,
} from '@/components/landing'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <ComparisonSection />
      <TrendingSection />
      <CTASection />
    </div>
  )
}
