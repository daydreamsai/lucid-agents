import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const runtime = await createAgent({
  name: 'text-service',
  version: '0.1.0',
  description: 'Paid text analysis',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(runtime);

addEntrypoint({
  key: 'analyze',
  description: 'Count the words and characters in text',
  price: '0.01',
  input: z.object({ text: z.string().min(1) }),
  output: z.object({ words: z.number(), characters: z.number() }),
  handler: async ({ input }) => ({
    output: {
      words: input.text.trim().split(/\s+/u).length,
      characters: input.text.length,
    },
  }),
});

export { app };
