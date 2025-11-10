addEntrypoint({
  key: "ax-brainstorm",
  description:
    "Summarise a topic and propose three follow-up ideas using an AxFlow pipeline.",
  input: z.object({
    topic: z
      .string()
      .min(1, { message: "Provide a topic to explore." })
      .describe("High-level topic to analyse."),
  }),
  output: z.object({
    summary: z.string(),
    ideas: z.array(z.string()),
    model: z.string().optional(),
  }),
  async handler({ input }) {
    const topic = String(input.topic ?? "").trim();
    if (!topic) {
      throw new Error("Topic cannot be empty.");
    }

    const llm = axClient.ax;
    if (!llm) {
      return {
        output: {
          summary: `AxLLM is not configured. Pretend summary for "${topic}".`,
          ideas: [
            "Set OPENAI_API_KEY to enable the Ax integration.",
            "Provide a PRIVATE_KEY so x402 can sign requests.",
            "Re-run the request once credentials are configured.",
          ],
          model: "axllm-fallback",
        },
      };
    }

    const result = await brainstormingFlow.forward(llm, { topic });
    const usageEntry = brainstormingFlow.getUsage().at(-1);
    brainstormingFlow.resetUsage();

    return {
      output: {
        summary: result.summary ?? "",
        ideas: Array.isArray(result.ideas) ? result.ideas : [],
        model: usageEntry?.model,
      },
      usage: usageEntry?.usage,
    };
  },
});
