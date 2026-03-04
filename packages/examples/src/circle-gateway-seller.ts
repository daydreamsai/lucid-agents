import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 3000);

async function main() {
  const agent = await createAgent({
    name: 'circle-gateway-seller',
    version: '0.1.0',
    description: 'Seller agent configured for Circle Gateway settlement.',
  })
    .use(http())
    .use(
      payments({
        config: paymentsFromEnv({
          facilitator: 'circle-gateway',
        }),
      })
    )
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  addEntrypoint({
    key: 'nanopayment-echo',
    description: 'Paid endpoint suitable for Circle Gateway micropayments.',
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string() }),
    price: '0.000001',
    handler: async ({ input }) => ({
      output: { text: input.text },
      usage: { total_tokens: 0 },
    }),
  });

  console.log(`[circle-gateway-seller] listening on http://localhost:${PORT}`);
  console.log(
    '[circle-gateway-seller] set CIRCLE_GATEWAY_FACILITATOR=true to enable gateway mode from env'
  );

  Bun.serve({
    port: PORT,
    fetch: app.fetch,
  });
}

main().catch(error => {
  console.error('[circle-gateway-seller] failed to start', error);
  process.exit(1);
});
