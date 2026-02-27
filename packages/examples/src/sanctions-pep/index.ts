import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

import {
  ExposureChainInputSchema,
  ExposureChainOutputSchema,
  JurisdictionRiskInputSchema,
  JurisdictionRiskOutputSchema,
  ScreeningCheckInputSchema,
  ScreeningCheckOutputSchema,
} from './__tests__/contracts.test';
import {
  buildOwnershipChain,
  calculateAggregateRisk,
  calculateFreshnessMetadata,
  calculateMatchConfidence,
  determineScreeningStatus,
} from './__tests__/business-logic.test';

/**
 * Sanctions & PEP Exposure Intelligence API
 *
 * Paid compliance API providing sanctions screening, PEP exposure checks,
 * and watchlist monitoring with ownership-chain risk context.
 *
 * Required environment variables:
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Wallet address for receiving payments
 *   - NETWORK - Network identifier (e.g., eip155:84532 for Base Sepolia)
 *
 * Run: bun run packages/examples/src/sanctions-pep/index.ts
 */

// Mock data sources (in production, these would be real databases)
const SANCTIONS_LISTS = [
  {
    name: 'Sanctioned Corp',
    aliases: ['Sanctioned Corporation', 'SC'],
    list: 'OFAC SDN',
    addedDate: '2024-01-01',
  },
  {
    name: 'Blocked Entity',
    aliases: ['BE Inc'],
    list: 'UN Sanctions',
    addedDate: '2024-01-15',
  },
];

const PEP_DATABASE = [
  {
    name: 'Political Figure',
    position: 'Minister',
    country: 'XX',
    riskLevel: 'high' as const,
  },
];

const OWNERSHIP_RECORDS = [
  {
    parent: 'Parent Corp',
    child: 'Test Corp',
    ownershipPct: 75,
    level: 0,
  },
  {
    parent: 'Grandparent Corp',
    child: 'Parent Corp',
    ownershipPct: 60,
    level: 0,
  },
];

const JURISDICTION_DATA = {
  US: {
    risk_level: 'low' as const,
    sanctions_active: true,
    pep_requirements: 'enhanced_due_diligence' as const,
  },
  EU: {
    risk_level: 'low' as const,
    sanctions_active: true,
    pep_requirements: 'enhanced_due_diligence' as const,
  },
  CN: {
    risk_level: 'medium' as const,
    sanctions_active: true,
    pep_requirements: 'standard_due_diligence' as const,
  },
  RU: {
    risk_level: 'high' as const,
    sanctions_active: true,
    pep_requirements: 'enhanced_due_diligence' as const,
  },
};

const agent = await createAgent({
  name: 'sanctions-pep-intelligence',
  version: '1.0.0',
  description:
    'Sanctions & PEP exposure intelligence API with ownership-chain risk analysis',
})
  .use(http())
  .use(
    payments({
      config: paymentsFromEnv(),
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * POST /v1/screening/check
 * Screen an entity against sanctions lists and PEP databases
 * Price: $0.10 per check
 */
addEntrypoint({
  key: 'screening-check',
  description: 'Screen entity against sanctions and PEP databases',
  price: '0.10',
  input: ScreeningCheckInputSchema,
  output: ScreeningCheckOutputSchema,
  handler: async ctx => {
    const { entityName } = ctx.input;

    // Perform sanctions screening
    const matches = [];
    let maxConfidence = 0;

    for (const listEntry of SANCTIONS_LISTS) {
      const confidence = calculateMatchConfidence(entityName, listEntry);

      if (confidence > 0) {
        matches.push({
          list: listEntry.list,
          entity: listEntry.name,
          confidence,
          reason:
            confidence === 1.0
              ? 'Exact name match'
              : confidence === 0.95
                ? 'Alias match'
                : 'Similar name match',
        });
        maxConfidence = Math.max(maxConfidence, confidence);
      }
    }

    // Check PEP database
    for (const pepEntry of PEP_DATABASE) {
      const confidence = calculateMatchConfidence(entityName, {
        name: pepEntry.name,
        aliases: [],
        list: 'PEP Database',
        addedDate: '2024-01-01',
      });

      if (confidence > 0) {
        matches.push({
          list: 'PEP Database',
          entity: pepEntry.name,
          confidence,
          reason: `${pepEntry.position} in ${pepEntry.country}`,
        });
        maxConfidence = Math.max(maxConfidence, confidence);
      }
    }

    const screening_status = determineScreeningStatus(matches);
    const lastUpdated = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    const freshness = calculateFreshnessMetadata(lastUpdated);

    return {
      output: {
        screening_status,
        match_confidence: maxConfidence,
        matches,
        evidence_bundle: {
          sources: ['OFAC', 'UN', 'EU', 'PEP Database'],
          last_updated: lastUpdated.toISOString(),
        },
        freshness,
      },
    };
  },
});

/**
 * GET /v1/screening/exposure-chain
 * Analyze ownership chain for sanctions/PEP exposure
 * Price: $0.15 per analysis
 */
addEntrypoint({
  key: 'exposure-chain',
  description: 'Analyze ownership chain for sanctions/PEP exposure',
  price: '0.15',
  input: ExposureChainInputSchema,
  output: ExposureChainOutputSchema,
  handler: async ctx => {
    const { entityName, ownershipDepth } = ctx.input;

    // Build ownership chain
    const chain = buildOwnershipChain(
      entityName,
      OWNERSHIP_RECORDS,
      ownershipDepth
    );

    // Check each entity in chain for exposure
    const exposure_chain = [];

    for (const record of chain) {
      let exposure_type: 'sanctions' | 'pep' | 'none' = 'none';
      let confidence = 0;

      // Check sanctions
      for (const listEntry of SANCTIONS_LISTS) {
        const matchConfidence = calculateMatchConfidence(
          record.parent,
          listEntry
        );
        if (matchConfidence > confidence) {
          confidence = matchConfidence;
          exposure_type = 'sanctions';
        }
      }

      // Check PEP
      for (const pepEntry of PEP_DATABASE) {
        const matchConfidence = calculateMatchConfidence(record.parent, {
          name: pepEntry.name,
          aliases: [],
          list: 'PEP',
          addedDate: '2024-01-01',
        });
        if (matchConfidence > confidence) {
          confidence = matchConfidence;
          exposure_type = 'pep';
        }
      }

      exposure_chain.push({
        level: record.level,
        entity: record.parent,
        ownership_pct: record.ownershipPct,
        exposure_type,
        confidence,
      });
    }

    const aggregate_risk = calculateAggregateRisk(exposure_chain);
    const lastUpdated = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 hours ago
    const freshness = calculateFreshnessMetadata(lastUpdated);

    return {
      output: {
        exposure_chain,
        aggregate_risk,
        freshness,
      },
    };
  },
});

/**
 * GET /v1/screening/jurisdiction-risk
 * Assess jurisdiction-specific compliance risks
 * Price: $0.08 per jurisdiction
 */
addEntrypoint({
  key: 'jurisdiction-risk',
  description: 'Assess jurisdiction-specific compliance risks',
  price: '0.08',
  input: JurisdictionRiskInputSchema,
  output: JurisdictionRiskOutputSchema,
  handler: async ctx => {
    const { jurisdictions } = ctx.input;

    const jurisdiction_risk = jurisdictions.map(code => {
      const data = JURISDICTION_DATA[
        code as keyof typeof JURISDICTION_DATA
      ] || {
        risk_level: 'medium' as const,
        sanctions_active: false,
        pep_requirements: 'standard_due_diligence' as const,
      };

      return {
        jurisdiction: code,
        ...data,
      };
    });

    const lastUpdated = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const freshness = calculateFreshnessMetadata(lastUpdated);

    return {
      output: {
        jurisdiction_risk,
        freshness,
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3010);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Sanctions & PEP Intelligence API ready at http://${server.hostname}:${server.port}`
);
console.log(`   - POST /v1/screening/check - $0.10 per check`);
console.log(`   - GET /v1/screening/exposure-chain - $0.15 per analysis`);
console.log(`   - GET /v1/screening/jurisdiction-risk - $0.08 per jurisdiction`);
console.log(`   - GET /.well-known/agent.json - Agent manifest`);
