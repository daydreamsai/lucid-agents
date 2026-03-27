import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';

import type {
  ExposureChainResponse,
  JurisdictionRiskEntry,
  JurisdictionRiskResponse,
  OwnershipNode,
} from './schema';
import {
  ExposureChainRequestSchema,
  ExposureChainResponseSchema,
  JurisdictionRiskRequestSchema,
  JurisdictionRiskResponseSchema,
  ScreeningCheckRequestSchema,
  ScreeningCheckResponseSchema,
} from './schema';
import { createFreshness,performScreeningCheck } from './screening';

// ============================================================================
// Sanctions & PEP Exposure Intelligence API
// ============================================================================

// --- Mock Data Sources (replace with real data providers in production) ---
const SANCTIONS_DATABASE = [
  { name: 'Viktor Bout', aliases: ['Victor Bout', 'The Merchant of Death'], list: 'OFAC_SDN', programs: ['SDGT', 'UKRAINE-EO13662'], id: 'sdn-12345' },
  { name: 'Sinaloa Cartel', aliases: ['CDS'], list: 'OFAC_SDN', programs: ['SDNTK'], id: 'sdn-67890' },
  { name: 'Russian Direct Investment Fund', aliases: ['RDIF'], list: 'EU_SANCTIONS', programs: ['RUSSIA'], id: 'eu-11111' },
  { name: 'Bank Rossiya', aliases: [], list: 'OFAC_SDN', programs: ['UKRAINE-EO13662'], id: 'sdn-22222' },
  { name: 'Korea Kwangson Banking Corp', aliases: ['KKBC'], list: 'UN_SANCTIONS', programs: ['DPRK'], id: 'un-33333' },
];

const PEP_DATABASE = [
  { name: 'Vladimir Putin', category: 'head_of_state', position: 'President of Russia', country: 'RU', active: true, id: 'pep-001' },
  { name: 'Xi Jinping', category: 'head_of_state', position: 'President of China', country: 'CN', active: true, id: 'pep-002' },
  { name: 'Angela Merkel', category: 'head_of_state', position: 'Former Chancellor of Germany', country: 'DE', active: false, id: 'pep-003' },
  { name: 'Hunter Biden', category: 'family_member', position: 'Son of US President', country: 'US', active: true, id: 'pep-004' },
  { name: 'Boris Johnson', category: 'head_of_state', position: 'Former Prime Minister of UK', country: 'GB', active: false, id: 'pep-005' },
];

const JURISDICTION_DATA: Record<string, Omit<JurisdictionRiskEntry, 'jurisdiction'>> = {
  US: { jurisdiction_name: 'United States', overall_risk: 'low', sanctions_programs_active: [], fatf_status: 'member', cpi_score: 67, risk_factors: [] },
  GB: { jurisdiction_name: 'United Kingdom', overall_risk: 'low', sanctions_programs_active: [], fatf_status: 'member', cpi_score: 73, risk_factors: [] },
  DE: { jurisdiction_name: 'Germany', overall_risk: 'low', sanctions_programs_active: [], fatf_status: 'member', cpi_score: 79, risk_factors: [] },
  RU: { jurisdiction_name: 'Russia', overall_risk: 'high', sanctions_programs_active: ['UKRAINE-EO13662', 'RUSSIA-EO14024'], fatf_status: 'grey_list', cpi_score: 28, risk_factors: ['Comprehensive sanctions', 'FATF grey list'] },
  IR: { jurisdiction_name: 'Iran', overall_risk: 'critical', sanctions_programs_active: ['IRAN', 'IRAN-TRA'], fatf_status: 'black_list', cpi_score: 24, risk_factors: ['Comprehensive sanctions', 'FATF black list', 'Terrorism financing'] },
  KP: { jurisdiction_name: 'North Korea', overall_risk: 'critical', sanctions_programs_active: ['DPRK', 'DPRK2', 'DPRK3'], fatf_status: 'black_list', cpi_score: 17, risk_factors: ['Comprehensive sanctions', 'FATF black list', 'Nuclear proliferation'] },
  CN: { jurisdiction_name: 'China', overall_risk: 'medium', sanctions_programs_active: ['CMIC-EO13959'], fatf_status: 'member', cpi_score: 42, risk_factors: ['Selective sanctions', 'IP concerns'] },
  AE: { jurisdiction_name: 'United Arab Emirates', overall_risk: 'medium', sanctions_programs_active: [], fatf_status: 'grey_list', cpi_score: 67, risk_factors: ['FATF grey list', 'Sanctions evasion hub'] },
  PA: { jurisdiction_name: 'Panama', overall_risk: 'high', sanctions_programs_active: [], fatf_status: 'grey_list', cpi_score: 36, risk_factors: ['FATF grey list', 'Tax haven', 'Shell company jurisdiction'] },
  VG: { jurisdiction_name: 'British Virgin Islands', overall_risk: 'high', sanctions_programs_active: [], fatf_status: 'not_evaluated', cpi_score: undefined, risk_factors: ['Tax haven', 'Opaque ownership structures'] },
};

// --- Agent Setup ---
const agent = await createAgent({
  name: 'sanctions-pep-api',
  version: '1.0.0',
  description: 'Sanctions & PEP Exposure Intelligence API - AML screening with ownership-chain risk context',
})
  .use(http())
  .use(
    payments({
      config: {
        payTo: process.env.PAYMENT_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        network: process.env.PAYMENT_NETWORK || 'eip155:84532',
        facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems',
      },
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// ============================================================================
// Entrypoints
// ============================================================================

/**
 * POST /v1/screening/check
 * Screen an entity against sanctions lists and PEP databases
 * Price: $0.50 per check
 */
addEntrypoint({
  key: 'screening-check',
  description: 'Screen entity against sanctions and PEP databases with confidence scoring',
  price: '0.5',
  input: ScreeningCheckRequestSchema,
  output: ScreeningCheckResponseSchema,
  handler: async ctx => {
    const result = performScreeningCheck(ctx.input, SANCTIONS_DATABASE, PEP_DATABASE);
    return { output: result };
  },
});

/**
 * GET /v1/screening/exposure-chain
 * Analyze ownership chain for sanctions/PEP exposure
 * Price: $2.00 per analysis
 */
addEntrypoint({
  key: 'exposure-chain',
  description: 'Analyze ownership chain for sanctions and PEP exposure with risk paths',
  price: '2.0',
  input: ExposureChainRequestSchema,
  output: ExposureChainResponseSchema,
  handler: async ctx => {
    const { entity_name, ownership_depth, include_indirect } = ctx.input;
    
    // Mock ownership chain analysis
    const ownershipChain: OwnershipNode[] = [
      {
        entity_id: 'ent-root',
        entity_name: entity_name,
        entity_type: ctx.input.entity_type || 'organization',
        ownership_percentage: 100,
        control_type: 'direct',
        jurisdiction: 'US',
        risk_flags: [],
        sanctions_exposure: false,
        pep_exposure: false,
      },
    ];

    // Simulate finding risky ownership paths for certain entities
    const highRiskPaths: ExposureChainResponse['high_risk_paths'] = [];
    const sanctionsExposed = 0;
    let pepExposed = 0;
    const highRiskJurisdictions: string[] = [];

    // Check if entity name suggests risk (demo logic)
    if (entity_name.toLowerCase().includes('offshore') || entity_name.toLowerCase().includes('shell')) {
      ownershipChain.push({
        entity_id: 'ent-layer1',
        entity_name: 'Offshore Holdings Ltd',
        entity_type: 'organization',
        ownership_percentage: 100,
        control_type: 'indirect',
        jurisdiction: 'VG',
        risk_flags: ['Tax haven jurisdiction', 'Opaque ownership'],
        sanctions_exposure: false,
        pep_exposure: false,
      });
      highRiskJurisdictions.push('VG');

      if (include_indirect && ownership_depth >= 2) {
        ownershipChain.push({
          entity_id: 'ent-layer2',
          entity_name: 'Panama Trust SA',
          entity_type: 'organization',
          ownership_percentage: 51,
          control_type: 'beneficial',
          jurisdiction: 'PA',
          risk_flags: ['FATF grey list', 'Shell company'],
          sanctions_exposure: false,
          pep_exposure: true,
        });
        pepExposed = 1;
        highRiskJurisdictions.push('PA');

        highRiskPaths.push({
          path: [entity_name, 'Offshore Holdings Ltd', 'Panama Trust SA'],
          risk_reason: 'Ownership chain through multiple high-risk jurisdictions with PEP exposure',
          risk_level: 'high',
        });
      }
    }

    const response: ExposureChainResponse = {
      root_entity: entity_name,
      ownership_chain: ownershipChain,
      total_depth_analyzed: Math.min(ownership_depth, ownershipChain.length),
      high_risk_paths: highRiskPaths,
      aggregate_exposure: {
        sanctions_exposed_entities: sanctionsExposed,
        pep_exposed_entities: pepExposed,
        high_risk_jurisdictions: [...new Set(highRiskJurisdictions)],
      },
      freshness: createFreshness(),
      confidence: highRiskPaths.length > 0 ? 0.85 : 0.95,
    };

    return { output: response };
  },
});

/**
 * GET /v1/screening/jurisdiction-risk
 * Get risk assessment for specified jurisdictions
 * Price: $0.25 per jurisdiction (batch)
 */
addEntrypoint({
  key: 'jurisdiction-risk',
  description: 'Get sanctions programs and FATF status for jurisdictions',
  price: '0.25',
  input: JurisdictionRiskRequestSchema,
  output: JurisdictionRiskResponseSchema,
  handler: async ctx => {
    const { jurisdictions, include_sanctions_programs, include_fatf_status } = ctx.input;

    const jurisdictionRisks: JurisdictionRiskEntry[] = jurisdictions.map(code => {
      const data = JURISDICTION_DATA[code.toUpperCase()];
      if (data) {
        return {
          jurisdiction: code.toUpperCase(),
          jurisdiction_name: data.jurisdiction_name,
          overall_risk: data.overall_risk,
          sanctions_programs_active: include_sanctions_programs ? data.sanctions_programs_active : [],
          fatf_status: include_fatf_status ? data.fatf_status : undefined,
          cpi_score: data.cpi_score,
          risk_factors: data.risk_factors,
        };
      }
      // Unknown jurisdiction
      return {
        jurisdiction: code.toUpperCase(),
        jurisdiction_name: `Unknown (${code.toUpperCase()})`,
        overall_risk: 'medium' as const,
        sanctions_programs_active: [],
        fatf_status: 'not_evaluated' as const,
        risk_factors: ['Jurisdiction data not available'],
      };
    });

    const highRiskCount = jurisdictionRisks.filter(
      j => j.overall_risk === 'high' || j.overall_risk === 'critical'
    ).length;

    const response: JurisdictionRiskResponse = {
      jurisdiction_risks: jurisdictionRisks,
      high_risk_count: highRiskCount,
      freshness: createFreshness(),
      confidence: 0.95,
    };

    return { output: response };
  },
});

// ============================================================================
// Server Startup
// ============================================================================

const port = Number(process.env.PORT ?? 3002);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     Sanctions & PEP Exposure Intelligence API                    ║
║     Ready at http://${server.hostname}:${server.port}                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Endpoints (x402 payment required):                              ║
║    POST /entrypoints/screening-check/invoke     - $0.50/check    ║
║    POST /entrypoints/exposure-chain/invoke      - $2.00/analysis ║
║    POST /entrypoints/jurisdiction-risk/invoke   - $0.25/batch    ║
║                                                                  ║
║  Discovery:                                                      ║
║    GET  /.well-known/agent.json                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

export { app };
