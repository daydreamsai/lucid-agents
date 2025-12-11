import { cn } from '@/lib/utils'

interface LandingContainerProps {
  children: React.ReactNode
  className?: string
}

export function LandingContainer({ children, className }: LandingContainerProps) {
  return (
    <div className={cn('max-w-6xl mx-auto px-6', className)}>
      {children}
    </div>
  )
}

interface LandingSectionProps {
  children: React.ReactNode
  className?: string
  id?: string
}

export function LandingSection({ children, className, id }: LandingSectionProps) {
  return (
    <section id={id} className={cn('py-16 md:py-24', className)}>
      <LandingContainer>{children}</LandingContainer>
    </section>
  )
}

interface SectionHeaderProps {
  title: string
  description?: string
  className?: string
}

export function SectionHeader({ title, description, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-12', className)}>
      <h2 className="text-3xl font-bold tracking-tight mb-3">{title}</h2>
      {description && (
        <p className="text-muted-foreground text-lg max-w-2xl">{description}</p>
      )}
    </div>
  )
}
