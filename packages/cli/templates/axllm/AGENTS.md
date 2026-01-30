# AxLLM Agent Template - AI Coding Guide

This guide helps AI coding agents understand and extend this AxLLM-powered agent project.

## Project Overview

This is a Bun HTTP agent with `@ax-llm/ax` integration for LLM-powered capabilities. It includes payment support via x402 and uses `@lucid-agents/core` for agent app creation.

**Key Files:**
- `src/agent.ts` - Agent definition, AxLLM client setup, and entrypoints
- `src/index.ts` - Bun HTTP server setup
- `.env` - Configuration (API keys, payment settings, etc.)

**Key Dependencies:**
- `@lucid-agents/core` - Agent app framework
- `@ax-llm/ax` - LLM client library
- `zod` - Schema validation

## Build & Development Commands

```bash
# Install dependencies
bun install

# Start in development mode (watch mode)
bun run dev

# Start once (production)
bun run start

# Type check
bunx tsc --noEmit
```

## Template Arguments

This template accepts the following configuration arguments (see `template.schema.json`):

- `AGENT_NAME` - Set automatically from project name
- `AGENT_DESCRIPTION` - Human-readable description
- `AGENT_VERSION` - Semantic version (e.g., "0.1.0")
- `PAYMENTS_FACILITATOR_URL` - x402 facilitator endpoint
- `PAYMENTS_NETWORK` - Network identifier (e.g., "ethereum")
- `PAYMENTS_RECEIVABLE_ADDRESS` - Address that receives payments
- `PRIVATE_KEY` - Wallet private key (optional)

Additionally, you'll need LLM API keys in `.env`:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Or Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Or other providers supported by Ax
```

## How to Use the AxLLM Client

The template includes a pre-configured `axClient`:

```typescript
import { createAxLLMClient } from "@lucid-agents/core";

const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[agent] ${message}`, error);
      } else {
        console.warn(`[agent] ${message}`);
      }
    },
  },
});

// Check if LLM provider is configured
if (!axClient.isConfigured()) {
  console.warn("LLM provider not configured - add API keys to .env");
}
```

## How to Add LLM-Powered Entrypoints

### Simple Text Generation

```typescript
addEntrypoint({
  key: "generate",
  description: "Generate text with LLM",
  input: z.object({
    prompt: z.string().min(1, "Prompt is required"),
  }),
  output: z.object({
    text: z.string(),
  }),
  handler: async ({ input }) => {
    if (!axClient.isConfigured()) {
      throw new Error("LLM provider not configured");
    }

    const result = await axClient.gen({
      prompt: input.prompt,
      model: "gpt-4",
    });

    return {
      output: {
        text: result.text,
      },
      usage: {
        prompt_tokens: result.usage?.promptTokens,
        completion_tokens: result.usage?.completionTokens,
        total_tokens: result.usage?.totalTokens,
      },
      model: result.model,
    };
  },
});
```

### Structured Output with Zod Schema

```typescript
addEntrypoint({
  key: "extract-info",
  description: "Extract structured information from text",
  input: z.object({
    text: z.string(),
  }),
  output: z.object({
    person: z.object({
      name: z.string(),
      age: z.number().optional(),
      occupation: z.string().optional(),
    }),
  }),
  handler: async ({ input }) => {
    const outputSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
      occupation: z.string().optional(),
    });

    const result = await axClient.gen({
      prompt: `Extract person information from this text: ${input.text}`,
      schema: outputSchema,
      model: "gpt-4",
    });

    return {
      output: {
        person: result.data,
      },
      usage: {
        prompt_tokens: result.usage?.promptTokens,
        completion_tokens: result.usage?.completionTokens,
        total_tokens: result.usage?.totalTokens,
      },
    };
  },
});
```

### Chat Completion

```typescript
addEntrypoint({
  key: "chat",
  description: "Chat with the agent",
  input: z.object({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    ),
  }),
  output: z.object({
    message: z.string(),
  }),
  handler: async ({ input }) => {
    const result = await axClient.gen({
      messages: input.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      model: "gpt-4",
    });

    return {
      output: {
        message: result.text,
      },
      usage: {
        prompt_tokens: result.usage?.promptTokens,
        completion_tokens: result.usage?.completionTokens,
        total_tokens: result.usage?.totalTokens,
      },
    };
  },
});
```

### Function Calling / Tool Use

```typescript
addEntrypoint({
  key: "assistant",
  description: "AI assistant with tool access",
  input: z.object({
    query: z.string(),
  }),
  output: z.object({
    answer: z.string(),
    toolsCalled: z.array(z.string()).optional(),
  }),
  handler: async ({ input }) => {
    const tools = [
      {
        name: "get_weather",
        description: "Get current weather for a location",
        parameters: z.object({
          location: z.string(),
        }),
        execute: async ({ location }: { location: string }) => {
          // Mock implementation
          return { temp: 72, condition: "sunny", location };
        },
      },
    ];

    const result = await axClient.gen({
      prompt: `User query: ${input.query}`,
      tools,
      model: "gpt-4",
    });

    return {
      output: {
        answer: result.text,
        toolsCalled: result.toolCalls?.map((t) => t.name),
      },
      usage: {
        prompt_tokens: result.usage?.promptTokens,
        completion_tokens: result.usage?.completionTokens,
        total_tokens: result.usage?.totalTokens,
      },
    };
  },
});
```

## Streaming Responses

For long-form content, use streaming:

```typescript
addEntrypoint({
  key: "stream-story",
  description: "Stream a generated story",
  input: z.object({
    topic: z.string(),
  }),
  streaming: true,
  async stream(ctx, emit) {
    const stream = await axClient.genStream({
      prompt: `Write a short story about: ${ctx.input.topic}`,
      model: "gpt-4",
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        await emit({
          kind: "delta",
          delta: chunk.text,
          mime: "text/plain",
        });
      }
    }

    return {
      output: { text: fullText },
      usage: stream.usage,
    };
  },
});
```

## Payment Configuration

The template pre-configures payments via the `configOverrides`:

```typescript
const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL as any,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS as `0x${string}`,
    network: process.env.PAYMENTS_NETWORK as any,
  },
};
```

To charge for an LLM entrypoint:

```typescript
addEntrypoint({
  key: "premium-generation",
  description: "Premium text generation",
  input: z.object({ prompt: z.string() }),
  price: "10000", // Price in smallest unit
  handler: async ({ input }) => {
    // LLM logic here
  },
});
```

## Environment Variables Guide

Required in `.env`:

```bash
# Agent metadata
AGENT_NAME=my-llm-agent
AGENT_VERSION=0.1.0
AGENT_DESCRIPTION=AI-powered agent with LLM capabilities

# LLM Provider (at least one)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Payment configuration
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_NETWORK=ethereum
PAYMENTS_RECEIVABLE_ADDRESS=0x...

# Optional
PRIVATE_KEY=0x...
```

## Testing Your Agent

### Test LLM Generation

```bash
curl -X POST http://localhost:3000/entrypoints/generate/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "Write a haiku about coding"
    }
  }'
```

### Test Streaming

```bash
curl -X POST http://localhost:3000/entrypoints/stream-story/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "topic": "space exploration"
    }
  }'
```

## Common Patterns

### Fallback When LLM Not Configured

```typescript
handler: async ({ input }) => {
  if (!axClient.isConfigured()) {
    // Return a scripted response
    return {
      output: {
        text: `Echo: ${input.text}`,
      },
    };
  }

  // Use LLM when available
  const result = await axClient.gen({
    prompt: input.text,
  });

  return {
    output: { text: result.text },
    usage: result.usage,
  };
}
```

### Error Handling for LLM Calls

```typescript
handler: async ({ input }) => {
  try {
    const result = await axClient.gen({
      prompt: input.prompt,
      model: "gpt-4",
    });

    return {
      output: { text: result.text },
      usage: result.usage,
    };
  } catch (error) {
    if (error.code === "RATE_LIMIT") {
      throw new Error("Rate limit exceeded, please try again later");
    }
    throw error; // Re-throw other errors
  }
}
```

### Using Different Models

```typescript
// Fast and cheap
const quickResult = await axClient.gen({
  prompt: input.text,
  model: "gpt-3.5-turbo",
});

// More capable
const smartResult = await axClient.gen({
  prompt: input.text,
  model: "gpt-4",
});

// Anthropic
const claudeResult = await axClient.gen({
  prompt: input.text,
  model: "claude-3-5-sonnet-20241022",
});
```

## API Reference

### createAxLLMClient(options?)

Creates an AxLLM client configured from environment variables.

**Options:**
- `logger`: Optional logger with `warn` method

**Returns:** AxLLM client with methods:
- `gen(params)` - Generate text
- `genStream(params)` - Generate text with streaming
- `isConfigured()` - Check if API keys are present

### AxLLM gen() Parameters

- `prompt`: String prompt or system message
- `messages`: Array of chat messages (alternative to prompt)
- `model`: Model name (e.g., "gpt-4", "claude-3-5-sonnet-20241022")
- `schema`: Zod schema for structured output
- `tools`: Array of tool definitions for function calling
- `temperature`: Sampling temperature (0-2)
- `maxTokens`: Maximum tokens to generate

## Troubleshooting

### "LLM provider not configured"

Add at least one API key to `.env`:
```bash
OPENAI_API_KEY=sk-...
```

### API key errors

Ensure:
1. Key is valid and not expired
2. Key has appropriate permissions
3. Environment variable name matches provider (OPENAI_API_KEY, ANTHROPIC_API_KEY)

### Rate limiting

Consider:
1. Adding retry logic
2. Using cheaper models for development
3. Implementing request throttling

### Streaming not working

Ensure:
1. Entrypoint has `streaming: true`
2. Using the `/stream` endpoint, not `/invoke`
3. Client supports Server-Sent Events (SSE)

## Next Steps

1. **Configure LLM provider** - Add API key to `.env`
2. **Test basic generation** - Try the echo entrypoint
3. **Add custom LLM entrypoints** - Follow patterns above
4. **Configure payments** - Set up x402 for monetization
5. **Deploy** - Use Bun-compatible hosting platform

## Additional Resources

- [@ax-llm/ax documentation](https://github.com/dosco/ax)
- [OpenAI API reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API reference](https://docs.anthropic.com/claude/reference)
- [@lucid-agents/core docs](../../../core/README.md)
