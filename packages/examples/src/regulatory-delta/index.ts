import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Regulatory Delta Feed for Agent Compliance
 * 
 * Provides machine-readable regulation/policy deltas with impact tagging
 * for compliance automation agents.
 * 
 * Endpoints:
 * - regulations-delta: Get regulatory changes by jurisdiction
 * - regulations-impact: Get affected controls for a specific rule
 * - regulations-map-controls: Map regulations to control frameworks
 * 
 * All endpoints require payment (x402) and include freshness metadata.
 */

const agent = await createAgent({
  name: 'regulatory-delta-feed',
  version: '1.0.0',
  description: 'Regulatory compliance delta feed for agents',
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
 * Get regulatory deltas by jurisdiction
 * Price: $0.05 per call
 */
addEntrypoint({
  key: 'regulations-delta',
  description: 'Get regulatory changes by jurisdiction with impact tagging',
  price: '0.05',
  input: z.object({
    jurisdiction: z.string().min(2).describe('Jurisdiction code (e.g., US, EU, UK)'),
    industry: z.string().optional().describe('Industry filter (e.g., finance, healthcare)'),
    since: z.string().datetime().optional().describe('Filter changes since this date'),
    source_priority: z.array(z.string()).optional().describe('Prioritize specific sources'),
  }),
  output: z.object({
    deltas: z.array(
      z.object({
        rule_id: z.string(),
        jurisdiction: z.string(),
        semantic_change_type: z.enum(['added', 'modified', 'removed', 'clarified']),
        diff_text: z.string(),
        effective_date: z.string().datetime(),
        urgency_score: z.number().min(0).max(10),
        source_url: z.string().url().optional(),
        freshness_timestamp: z.string().datetime(),
        confidence_score: z.number().min(0).max(1),
      })
    ),
    total_count: z.number(),
    freshness_timestamp: z.string().datetime(),
  }),
  handler: async ctx => {
    const { jurisdiction, industry, since, source_priority } = ctx.input;
    
    // Mock implementation - replace with actual data source
    const mockDeltas = [
      {
        rule_id: 'SEC-2024-001',
        jurisdiction: jurisdiction,
        semantic_change_type: 'modified' as const,
        diff_text: 'Updated disclosure requirements for cybersecurity incidents',
        effective_date: '2024-06-01T00:00:00Z',
        urgency_score: 7.5,
        source_url: 'https://sec.gov/rules/2024-001',
        freshness_timestamp: new Date().toISOString(),
        confidence_score: 0.95,
      },
      {
        rule_id: 'SEC-2024-002',
        jurisdiction: jurisdiction,
        semantic_change_type: 'added' as const,
        diff_text: 'New requirements for AI system documentation',
        effective_date: '2024-09-01T00:00:00Z',
        urgency_score: 8.0,
        source_url: 'https://sec.gov/rules/2024-002',
        freshness_timestamp: new Date().toISOString(),
        confidence_score: 0.92,
      },
    ];

    // Filter by since date if provided
    let filteredDeltas = mockDeltas;
    if (since) {
      filteredDeltas = mockDeltas.filter(d => d.effective_date >= since);
    }

    // Sort by urgency score descending
    filteredDeltas.sort((a, b) => b.urgency_score - a.urgency_score);

    return {
      output: {
        deltas: filteredDeltas,
        total_count: filteredDeltas.length,
        freshness_timestamp: new Date().toISOString(),
      },
    };
  },
});

/**
 * Get impact analysis for a specific rule
 * Price: $0.03 per call
 */
addEntrypoint({
  key: 'regulations-impact',
  description: 'Get affected controls and impact analysis for a specific rule',
  price: '0.03',
  input: z.object({
    jurisdiction: z.string().min(2).describe('Jurisdiction code'),
    rule_id: z.string().describe('Rule identifier'),
    control_framework: z.string().optional().describe('Control framework (e.g., SOC2, ISO27001)'),
  }),
  output: z.object({
    rule_id: z.string(),
    affected_controls: z.array(
      z.object({
        control_id: z.string(),
        control_name: z.string(),
        impact_level: z.enum(['high', 'medium', 'low']),
        remediation_required: z.boolean(),
      })
    ),
    freshness_timestamp: z.string().datetime(),
    confidence_score: z.number().min(0).max(1),
  }),
  handler: async ctx => {
    const { jurisdiction, rule_id, control_framework } = ctx.input;

    // Mock implementation - replace with actual mapping logic
    const mockControls = [
      {
        control_id: 'SOC2-CC6.1',
        control_name: 'Logical and Physical Access Controls',
        impact_level: 'high' as const,
        remediation_required: true,
      },
      {
        control_id: 'SOC2-CC7.2',
        control_name: 'System Monitoring',
        impact_level: 'medium' as const,
        remediation_required: true,
      },
      {
        control_id: 'SOC2-CC9.1',
        control_name: 'Risk Assessment',
        impact_level: 'low' as const,
        remediation_required: false,
      },
    ];

    return {
      output: {
        rule_id,
        affected_controls: mockControls,
        freshness_timestamp: new Date().toISOString(),
        confidence_score: 0.88,
      },
    };
  },
});

/**
 * Map regulations to control frameworks
 * Price: $0.04 per call
 */
addEntrypoint({
  key: 'regulations-map-controls',
  description: 'Map regulations to control framework requirements',
  price: '0.04',
  input: z.object({
    jurisdiction: z.string().min(2).describe('Jurisdiction code'),
    industry: z.string().describe('Industry sector'),
    control_framework: z.string().describe('Target control framework'),
  }),
  output: z.object({
    mappings: z.array(
      z.object({
        regulation_id: z.string(),
        control_id: z.string(),
        mapping_confidence: z.number().min(0).max(1),
      })
    ),
    framework: z.string(),
    freshness_timestamp: z.string().datetime(),
  }),
  handler: async ctx => {
    const { jurisdiction, industry, control_framework } = ctx.input;

    // Mock implementation - replace with actual mapping database
    const mockMappings = [
      {
        regulation_id: 'SEC-2024-001',
        control_id: 'SOC2-CC6.1',
        mapping_confidence: 0.92,
      },
      {
        regulation_id: 'SEC-2024-001',
        control_id: 'SOC2-CC7.2',
        mapping_confidence: 0.85,
      },
      {
        regulation_id: 'SEC-2024-002',
        control_id: 'SOC2-CC9.1',
        mapping_confidence: 0.78,
      },
    ];

    return {
      output: {
        mappings: mockMappings,
        framework: control_framework,
        freshness_timestamp: new Date().toISOString(),
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3100);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Regulatory Delta Feed ready at http://${server.hostname}:${server.port}`
);
console.log(`   - /entrypoints/regulations-delta/invoke - $0.05 per call`);
console.log(`   - /entrypoints/regulations-impact/invoke - $0.03 per call`);
console.log(`   - /entrypoints/regulations-map-controls/invoke - $0.04 per call`);
console.log(`   - /.well-known/agent.json - Agent manifest`);
