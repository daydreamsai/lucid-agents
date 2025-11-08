# AxLLM Flow Agent Template - AI Coding Guide

This guide helps AI coding agents understand and extend this AxLLM Flow-powered agent project.

## Project Overview

This is a Bun HTTP agent with `@ax-llm/ax` Flow integration for multi-step LLM workflows. It includes payment support via x402 and uses `@lucid-agents/agent-kit` for agent app creation.

**Key Files:**
- `src/agent.ts` - Agent definition, AxLLM client setup, and flow-based entrypoints
- `src/index.ts` - Bun HTTP server setup
- `.env` - Configuration (API keys, payment settings, etc.)

**Key Dependencies:**
- `@lucid-agents/agent-kit` - Agent app framework
- `@ax-llm/ax` - LLM client library with Flow support
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
- `PAYMENTS_NETWORK` - Network identifier (e.g., "base-sepolia")
- `PAYMENTS_RECEIVABLE_ADDRESS` - Address that receives payments
- `PAYMENTS_DEFAULT_PRICE` - Default price in base units
- `PRIVATE_KEY` - Wallet private key (optional)

LLM API keys needed in `.env`:

```bash
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

## What are Flows?

Flows in AxLLM allow you to chain multiple LLM calls and operations together. This is useful for:

- Multi-step reasoning tasks
- Iterative refinement
- Chain-of-thought prompting
- Complex workflows with decision points

## How to Use Flows

### Basic Flow Pattern

```typescript
import { flow } from "@ax-llm/ax";

addEntrypoint({
  key: "analyze-and-summarize",
  description: "Analyze text and create a summary",
  input: z.object({
    text: z.string(),
  }),
  output: z.object({
    analysis: z.string(),
    summary: z.string(),
  }),
  handler: async ({ input }) => {
    // Step 1: Analyze the text
    const analysisResult = await axClient.gen({
      prompt: `Analyze this text for key themes and sentiment: ${input.text}`,
      model: "gpt-4",
    });

    // Step 2: Create summary based on analysis
    const summaryResult = await axClient.gen({
      prompt: `Based on this analysis, create a concise summary:

Analysis: ${analysisResult.text}
Original text: ${input.text}`,
      model: "gpt-4",
    });

    return {
      output: {
        analysis: analysisResult.text,
        summary: summaryResult.text,
      },
      usage: {
        prompt_tokens:
          (analysisResult.usage?.promptTokens || 0) +
          (summaryResult.usage?.promptTokens || 0),
        completion_tokens:
          (analysisResult.usage?.completionTokens || 0) +
          (summaryResult.usage?.completionTokens || 0),
        total_tokens:
          (analysisResult.usage?.totalTokens || 0) +
          (summaryResult.usage?.totalTokens || 0),
      },
    };
  },
});
```

### Using Ax Flow API

```typescript
import { flow } from "@ax-llm/ax";

addEntrypoint({
  key: "research-workflow",
  description: "Multi-step research workflow",
  input: z.object({
    topic: z.string(),
  }),
  output: z.object({
    outline: z.array(z.string()),
    details: z.string(),
  }),
  handler: async ({ input }) => {
    const result = await flow()
      // Step 1: Generate outline
      .step("outline", async () => {
        return await axClient.gen({
          prompt: `Create a research outline for: ${input.topic}`,
          schema: z.object({
            points: z.array(z.string()),
          }),
          model: "gpt-4",
        });
      })
      // Step 2: Expand each point
      .step("details", async (ctx) => {
        const outline = ctx.outline.data.points;
        const expanded = await Promise.all(
          outline.map((point) =>
            axClient.gen({
              prompt: `Expand on this research point: ${point}`,
              model: "gpt-4",
            })
          )
        );
        return expanded.map((r) => r.text).join("\n\n");
      })
      .run();

    return {
      output: {
        outline: result.outline.data.points,
        details: result.details,
      },
    };
  },
});
```

### Conditional Flow

```typescript
addEntrypoint({
  key: "smart-response",
  description: "Choose response strategy based on input complexity",
  input: z.object({
    question: z.string(),
  }),
  output: z.object({
    answer: z.string(),
    strategy: z.string(),
  }),
  handler: async ({ input }) => {
    // Step 1: Assess complexity
    const assessment = await axClient.gen({
      prompt: `Rate the complexity of this question (simple/moderate/complex): ${input.question}`,
      schema: z.object({
        complexity: z.enum(["simple", "moderate", "complex"]),
      }),
      model: "gpt-4",
    });

    let answer: string;
    let strategy: string;

    // Step 2: Choose strategy based on complexity
    if (assessment.data.complexity === "simple") {
      strategy = "direct";
      const result = await axClient.gen({
        prompt: input.question,
        model: "gpt-3.5-turbo", // Cheaper model for simple queries
      });
      answer = result.text;
    } else if (assessment.data.complexity === "moderate") {
      strategy = "analyzed";
      const result = await axClient.gen({
        prompt: `Think step by step: ${input.question}`,
        model: "gpt-4",
      });
      answer = result.text;
    } else {
      strategy = "chain-of-thought";
      // Complex: Use multiple steps
      const thinking = await axClient.gen({
        prompt: `Break down this complex question into sub-problems: ${input.question}`,
        model: "gpt-4",
      });
      const solution = await axClient.gen({
        prompt: `Given these sub-problems, provide a comprehensive answer:

Sub-problems: ${thinking.text}
Original question: ${input.question}`,
        model: "gpt-4",
      });
      answer = solution.text;
    }

    return {
      output: { answer, strategy },
    };
  },
});
```

### Iterative Refinement Flow

```typescript
addEntrypoint({
  key: "refine-content",
  description: "Iteratively refine content",
  input: z.object({
    draft: z.string(),
    criteria: z.string(),
  }),
  output: z.object({
    refined: z.string(),
    iterations: z.number(),
  }),
  handler: async ({ input }) => {
    let current = input.draft;
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
      // Review the current version
      const review = await axClient.gen({
        prompt: `Review this content against these criteria: "${input.criteria}"

Content: ${current}

Does it meet the criteria? If not, what improvements are needed?`,
        schema: z.object({
          meets_criteria: z.boolean(),
          improvements: z.string().optional(),
        }),
        model: "gpt-4",
      });

      if (review.data.meets_criteria) {
        break; // Done!
      }

      // Refine based on feedback
      const refined = await axClient.gen({
        prompt: `Improve this content based on feedback:

Current: ${current}
Improvements needed: ${review.data.improvements}
Criteria: ${input.criteria}`,
        model: "gpt-4",
      });

      current = refined.text;
      iterations++;
    }

    return {
      output: {
        refined: current,
        iterations,
      },
    };
  },
});
```

### Parallel Processing Flow

```typescript
addEntrypoint({
  key: "multi-perspective",
  description: "Get multiple perspectives on a topic",
  input: z.object({
    topic: z.string(),
  }),
  output: z.object({
    perspectives: z.array(
      z.object({
        viewpoint: z.string(),
        analysis: z.string(),
      })
    ),
    synthesis: z.string(),
  }),
  handler: async ({ input }) => {
    // Step 1: Generate multiple perspectives in parallel
    const viewpoints = ["optimistic", "skeptical", "neutral"];

    const perspectives = await Promise.all(
      viewpoints.map(async (viewpoint) => {
        const result = await axClient.gen({
          prompt: `Analyze "${input.topic}" from a ${viewpoint} perspective`,
          model: "gpt-4",
        });
        return {
          viewpoint,
          analysis: result.text,
        };
      })
    );

    // Step 2: Synthesize all perspectives
    const synthesis = await axClient.gen({
      prompt: `Synthesize these different perspectives into a balanced view:

${perspectives.map((p) => `${p.viewpoint}: ${p.analysis}`).join("\n\n")}`,
      model: "gpt-4",
    });

    return {
      output: {
        perspectives,
        synthesis: synthesis.text,
      },
    };
  },
});
```

## Streaming with Flows

```typescript
addEntrypoint({
  key: "stream-workflow",
  description: "Stream a multi-step workflow",
  input: z.object({
    topic: z.string(),
  }),
  streaming: true,
  async stream(ctx, emit) {
    // Step 1: Generate outline
    await emit({
      kind: "text",
      text: "Generating outline...\n",
      mime: "text/plain",
    });

    const outline = await axClient.gen({
      prompt: `Create an outline for: ${ctx.input.topic}`,
      model: "gpt-4",
    });

    await emit({
      kind: "text",
      text: `Outline:\n${outline.text}\n\n`,
      mime: "text/plain",
    });

    // Step 2: Stream detailed content
    await emit({
      kind: "text",
      text: "Generating detailed content...\n",
      mime: "text/plain",
    });

    const stream = await axClient.genStream({
      prompt: `Based on this outline, write detailed content:\n${outline.text}`,
      model: "gpt-4",
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        await emit({
          kind: "delta",
          delta: chunk.text,
          mime: "text/plain",
        });
      }
    }

    return {
      output: { completed: true },
    };
  },
});
```

## Environment Variables Guide

Required in `.env`:

```bash
# Agent metadata
AGENT_NAME=my-flow-agent
AGENT_VERSION=0.1.0
AGENT_DESCRIPTION=Multi-step LLM workflow agent

# LLM Provider (at least one)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...

# Payment configuration
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_NETWORK=base-sepolia
PAYMENTS_RECEIVABLE_ADDRESS=0x...
PAYMENTS_DEFAULT_PRICE=1000

# Optional
PRIVATE_KEY=0x...
```

## Testing Your Agent

```bash
# Test multi-step workflow
curl -X POST http://localhost:3000/entrypoints/analyze-and-summarize/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "text": "Your text here..."
    }
  }'

# Test streaming workflow
curl -X POST http://localhost:3000/entrypoints/stream-workflow/stream \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "topic": "quantum computing"
    }
  }'
```

## Common Patterns

### Error Handling in Flows

```typescript
handler: async ({ input }) => {
  try {
    const step1 = await axClient.gen({
      prompt: "First step",
      model: "gpt-4",
    });

    const step2 = await axClient.gen({
      prompt: `Second step based on: ${step1.text}`,
      model: "gpt-4",
    });

    return { output: { result: step2.text } };
  } catch (error) {
    console.error("Flow error:", error);
    // Return partial results or fallback
    throw new Error("Workflow failed at step processing");
  }
}
```

### Flow State Management

```typescript
handler: async ({ input }) => {
  const state = {
    results: [] as string[],
    totalTokens: 0,
  };

  for (let i = 0; i < input.steps.length; i++) {
    const result = await axClient.gen({
      prompt: input.steps[i],
      model: "gpt-4",
    });

    state.results.push(result.text);
    state.totalTokens += result.usage?.totalTokens || 0;
  }

  return {
    output: {
      results: state.results,
    },
    usage: {
      total_tokens: state.totalTokens,
    },
  };
}
```

## Performance Optimization

### Caching Intermediate Results

```typescript
const cache = new Map<string, any>();

handler: async ({ input }) => {
  const cacheKey = `analysis:${input.text}`;

  // Check cache for first step
  let analysis = cache.get(cacheKey);
  if (!analysis) {
    const result = await axClient.gen({
      prompt: `Analyze: ${input.text}`,
      model: "gpt-4",
    });
    analysis = result.text;
    cache.set(cacheKey, analysis);
  }

  // Use cached result for second step
  const summary = await axClient.gen({
    prompt: `Summarize this analysis: ${analysis}`,
    model: "gpt-4",
  });

  return {
    output: { summary: summary.text },
  };
}
```

## Troubleshooting

### Flow taking too long

Consider:
1. Running independent steps in parallel with `Promise.all()`
2. Using faster models for non-critical steps
3. Adding timeouts for individual steps

### Running out of context

For long flows:
1. Summarize intermediate results before passing to next step
2. Only include relevant information from previous steps
3. Consider breaking into multiple entrypoints

## Next Steps

1. **Configure LLM provider** - Add API key to `.env`
2. **Create a simple flow** - Start with 2-3 step workflow
3. **Test with streaming** - See real-time progress
4. **Add conditional logic** - Branch based on LLM output
5. **Deploy** - Use Bun-compatible hosting

## Additional Resources

- [@ax-llm/ax Flow documentation](https://github.com/dosco/ax)
- [Chain-of-thought prompting](https://www.promptingguide.ai/techniques/cot)
- [@lucid-agents/agent-kit docs](../../../agent-kit/README.md)

