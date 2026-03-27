import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';
import { LiquidityService } from './liquidity-service';
import {
  LiquiditySnapshotRequestSchema,
  LiquiditySnapshotResponseSchema,
  SlippageRequestSchema,
  SlippageResponseSchema,
  RoutesRequestSchema,
  RoutesResponseSchema,
  type LiquiditySnapshotRequest,
  type SlippageRequest,
  type RoutesRequest,
} from './schemas';

export * from './schemas';
export * from './liquidity-service';

/**
 * Register liquidity API entrypoints
 */
export async function registerEntrypoints(addEntrypoint: (config: any) => void) {
  const service = new LiquidityService();

  // Snapshot endpoint
  addEntrypoint({
    key: 'snapshot',
    description: 'Get cross-chain liquidity snapshot with pool depth, TVL, and freshness metadata',
    price: '0.10', // $0.10 per call
    input: LiquiditySnapshotRequestSchema,
    output: LiquiditySnapshotResponseSchema,
    handler: async (ctx: { input: LiquiditySnapshotRequest }) => {
      const output = await service.getSnapshot(ctx.input);
      return { output };
    },
  });

  // Slippage endpoint
  addEntrypoint({
    key: 'slippage',
    description: 'Calculate slippage curve by notional size with confidence scores',
    price: '0.15', // $0.15 per call
    input: SlippageRequestSchema,
    output: SlippageResponseSchema,
    handler: async (ctx: { input: SlippageRequest }) => {
      const output = await service.getSlippage(ctx.input);
      return { output };
    },
  });

  // Routes endpoint
  addEntrypoint({
    key: 'routes',
    description: 'Find best execution routes ranked by total cost (slippage + gas)',
    price: '0.20', // $0.20 per call
    input: RoutesRequestSchema,
    output: RoutesResponseSchema,
    handler: async (ctx: { input: RoutesRequest }) => {
      const output = await service.getRoutes(ctx.input);
      return { output };
    },
  });
}

/**
 * Create and start the liquidity API agent
 */
export async function createLiquidityAgent() {
  const agent = await createAgent({
    name: 'liquidity-api',
    version: '0.1.0',
    description: 'Cross-chain liquidity snapshot service with paid API endpoints',
  })
    .use(http())
    .use(
      payments({
        config: {
          payTo: process.env.WALLET_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          network: (process.env.NETWORK || 'eip155:84532') as `${string}:${string}`,
          facilitatorUrl: process.env.FACILITATOR_URL || 'https://facilitator.daydreams.systems',
        },
      })
    )
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  await registerEntrypoints(addEntrypoint);

  return { app, agent };
}

// CLI entry point
if (import.meta.main) {
  createLiquidityAgent().then(({ app }) => {
    const port = Number(process.env.PORT ?? 3000);
    const server = Bun.serve({
      port,
      fetch: app.fetch,
    });

    console.log(`🚀 Liquidity API agent running at http://${server.hostname}:${server.port}`);
    console.log(`   - GET  /.well-known/agent.json - Agent manifest`);
    console.log(`   - POST /entrypoints/snapshot/invoke - Liquidity snapshot ($0.10)`);
    console.log(`   - POST /entrypoints/slippage/invoke - Slippage curve ($0.15)`);
    console.log(`   - POST /entrypoints/routes/invoke - Best routes ($0.20)`);
  });
}
