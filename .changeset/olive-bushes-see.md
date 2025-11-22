---
'@lucid-agents/core': minor
'@lucid-agents/http': minor
'@lucid-agents/types': minor
'@lucid-agents/hono': minor
'@lucid-agents/express': minor
'@lucid-agents/tanstack': minor
'@lucid-agents/a2a': minor
'@lucid-agents/ap2': minor
'@lucid-agents/identity': minor
'@lucid-agents/payments': minor
'@lucid-agents/wallet': minor
'@lucid-agents/cli': minor
---

Refactor to extension-based architecture with HTTP as separate package

**Breaking Changes:**

- Removed `createAgentRuntime()` and `createAgentHttpRuntime()` - replaced with extension-based API
- HTTP extension moved to separate `@lucid-agents/http` package
- All adapters now use `createApp().use(extensions).build()` pattern

**New API:**

```typescript
import { createApp } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments } from '@lucid-agents/payments';
import { a2a } from '@lucid-agents/a2a';

const runtime = createApp(meta)
  .use(http())
  .use(identity({ trust }))
  .use(payments({ config }))
  .use(a2a())
  .build();
```

**Migration:**

- Replace `createAgentRuntime(meta, options)` with `createApp(meta).use(extensions).build()`
- Replace `createAgentHttpRuntime(meta, options)` with `createApp(meta).use(http()).build()`
- Import `http` from `@lucid-agents/http` instead of `@lucid-agents/core`
- Update CLI templates and examples to use new extension API
