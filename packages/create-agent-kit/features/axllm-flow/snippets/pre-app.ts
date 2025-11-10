const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[features:axllm-flow] ${message}`, error);
      } else {
        console.warn(`[features:axllm-flow] ${message}`);
      }
    },
  },
});

const brainstormingFlow = flow<{ topic: string }>()
  .node(
    "summarizer",
    'topic:string -> summary:string "Two concise sentences describing the topic."'
  )
  .node(
    "ideaGenerator",
    'summary:string -> ideas:string[] "Three short follow-up ideas."'
  )
  .execute("summarizer", state => ({
    topic: state.topic,
  }))
  .execute("ideaGenerator", state => ({
    summary: state.summarizerResult.summary as string,
  }))
  .returns(state => ({
    summary: String(state.summarizerResult.summary ?? "").trim(),
    ideas: Array.isArray(state.ideaGeneratorResult.ideas)
      ? (state.ideaGeneratorResult.ideas as string[]).map(value =>
          String(value ?? "").trim()
        )
      : [],
  }));
