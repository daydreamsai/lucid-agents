---
'@lucid-agents/agent-kit': patch
---

Stop enabling streaming by default in `createAxLLMClient` so generated AxLLM
clients only opt into streaming when explicitly requested via overrides.
