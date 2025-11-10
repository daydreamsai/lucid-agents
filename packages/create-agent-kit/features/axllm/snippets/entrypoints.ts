addEntrypoint({
  key: "ax-chat",
  description:
    "Answer questions with AxLLM (falls back to scripted responses when not configured).",
  input: z.object({
    prompt: z
      .string()
      .min(1, { message: "Provide a prompt for AxLLM." })
      .describe("Question or instruction to answer."),
  }),
  output: z.object({
    responseText: z.string(),
    model: z.string().optional(),
  }),
  async handler({ input }) {
    const llm = axClient.ax;
    if (!llm) {
      return {
        output: {
          responseText: `AxLLM is not configured. Pretend answer for: "${input.prompt}". Set OPENAI_API_KEY to enable live responses.`,
          model: "axllm-fallback",
        },
      };
    }

    const result = await replyFlow.forward(llm, { prompt: input.prompt });
    const usageEntry = replyFlow.getUsage().at(-1);
    replyFlow.resetUsage();

    return {
      output: {
        responseText: result.responseText ?? "",
        model: usageEntry?.model,
      },
      usage: usageEntry?.usage,
    };
  },
});
