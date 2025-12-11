import { Check, X, Minus } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LandingSection, SectionHeader } from './landing-container'

type ComparisonValue = 'yes' | 'no' | 'partial' | string

interface ComparisonRow {
  feature: string
  platform: ComparisonValue
  oss: ComparisonValue
  competitors: ComparisonValue
}

const comparisons: ComparisonRow[] = [
  { feature: 'Visual Agent Builder', platform: 'yes', oss: 'no', competitors: 'partial' },
  { feature: 'One-Click Deploy', platform: 'yes', oss: 'no', competitors: 'partial' },
  { feature: 'Managed Payments', platform: 'yes', oss: 'DIY', competitors: 'partial' },
  { feature: 'Built-in Analytics', platform: 'yes', oss: 'DIY', competitors: 'partial' },
  { feature: 'Agent Marketplace', platform: 'yes', oss: 'no', competitors: 'partial' },
  { feature: 'A2A Discovery', platform: 'yes', oss: 'Manual', competitors: 'no' },
  { feature: 'Identity Management', platform: 'yes', oss: 'Manual', competitors: 'no' },
  { feature: 'Multi-network Wallets', platform: 'yes', oss: 'Manual', competitors: 'partial' },
  { feature: 'Uptime SLA', platform: '99.9%', oss: 'N/A', competitors: 'partial' },
  { feature: 'Priority Support', platform: 'yes', oss: 'Community', competitors: 'partial' },
]

function ComparisonCell({ value }: { value: ComparisonValue }) {
  if (value === 'yes') {
    return <Check className="size-4 text-success mx-auto" />
  }
  if (value === 'no') {
    return <X className="size-4 text-muted-foreground/50 mx-auto" />
  }
  if (value === 'partial') {
    return <Minus className="size-4 text-chart-1 mx-auto" />
  }
  return <span className="text-sm text-muted-foreground">{value}</span>
}

export function ComparisonSection() {
  return (
    <LandingSection id="comparison" className="bg-muted/30">
      <SectionHeader
        title="Platform vs alternatives"
        description="See how Lucid Agents compares to self-hosting and other solutions."
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[40%]">Feature</TableHead>
              <TableHead className="text-center">Lucid Platform</TableHead>
              <TableHead className="text-center">Lucid OSS</TableHead>
              <TableHead className="text-center">Others</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparisons.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">{row.feature}</TableCell>
                <TableCell className="text-center">
                  <ComparisonCell value={row.platform} />
                </TableCell>
                <TableCell className="text-center">
                  <ComparisonCell value={row.oss} />
                </TableCell>
                <TableCell className="text-center">
                  <ComparisonCell value={row.competitors} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </LandingSection>
  )
}
