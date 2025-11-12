import { z } from 'zod';
import { createAgentApp } from '../src';

const { app, addEntrypoint } = createAgentApp({
  name: 'content-generation-agent',
  version: '0.1.0',
  description: 'Generates various types of content, from blog posts to social media updates.',
});

addEntrypoint({
  key: 'generate',
  description: 'Generate content based on a prompt',
  input: z.object({
    prompt: z.string(),
    type: z.enum(['blog', 'social', 'ad']),
  }),
  async handler(ctx) {
    const { prompt, type } = ctx.input;
    const client = (ctx as any).ax; // Access the ax client from the context

    if (!client) {
      throw new Error('Ax client not configured');
    }

    // This is a placeholder for the actual content generation logic.
    // In a real-world scenario, you would use the ax client to interact with an AI model.
    // For example:
    // const response = await client.generateText({ prompt: `Generate a ${type} post about ${prompt}` });
    // const output = response.text;
    const output = `This is a generated ${type} post about ${prompt}.`;

    return {
      output: { content: output },
      usage: { total_tokens: output.length },
    };
  },
});

export default app;
