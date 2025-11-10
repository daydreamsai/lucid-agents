const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[features:axllm] ${message}`, error);
      } else {
        console.warn(`[features:axllm] ${message}`);
      }
    },
  },
});

const replyFlow = flow<{ prompt: string }>()
  .node(
    "sage",
    'prompt:string -> reply_text:string "Answer the prompt with two concise sentences."'
  )
  .execute("sage", state => ({
    prompt: state.prompt,
  }))
  .returns(state => ({
    responseText: String(state.sageResult.reply_text ?? "").trim(),
  }));
