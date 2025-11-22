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

Refactor to protocol-agnostic extension-based architecture with HTTP as separate package

**Breaking Changes:**

- **Extension-based API**: Removed `createAgentRuntime()` and `createAgentHttpRuntime()` - replaced with extension-based API using `createAgent().use().build()`
- **HTTP as separate package**: HTTP extension moved to separate `@lucid-agents/http` package
- **Protocol-agnostic core**: `AgentCore` no longer has `invoke()`, `stream()`, or `resolveManifest()` methods - these are HTTP-specific and moved to `@lucid-agents/http`
- **AgentContext is protocol-agnostic**: Removed `headers: Headers` property, replaced with `metadata?: Record<string, unknown>` (HTTP extension adds headers to metadata)
- **ZodValidationError moved**: Moved from `@lucid-agents/core` to `@lucid-agents/types/core`
- **Removed utilities**: Removed `toJsonSchemaOrUndefined()` - inline `z.toJSONSchema()` directly where needed
- **Removed types**: Removed `InvokeContext`, `StreamContext`, and `InvokeResult` from `@lucid-agents/core` - these are HTTP-specific and now in `@lucid-agents/http`
- **All adapters**: Now use `createAgent().use(http()).build()` pattern and require HTTP extension
- **Identity package**: `createAgentIdentity()` now requires `runtime: AgentRuntime` parameter (breaking change) - must have `runtime.wallets.agent` configured

**New API:**

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity, identityFromEnv } from '@lucid-agents/identity';
import { payments } from '@lucid-agents/payments';
import { a2a } from '@lucid-agents/a2a';

// Option 1: Automatic identity creation via extension (recommended)
// The identity extension's onBuild hook automatically creates identity if config is provided
const agent = await createAgent(meta)
  .use(http())
  .use(wallets({ config: walletsFromEnv() }))
  .use(identity({ config: identityFromEnv() })) // Auto-creates identity during build
  .use(payments({ config }))
  .use(a2a())
  .build(); // All async onBuild hooks (including identity creation) are automatically awaited

// Option 2: Manual identity creation after build
const agent = await createAgent(meta)
  .use(http())
  .use(wallets({ config: walletsFromEnv() }))
  .use(identity()) // Extension without auto-create
  .build();

const identity = await createAgentIdentity({
  runtime: agent, // Now requires runtime parameter
  domain: process.env.AGENT_DOMAIN,
  autoRegister: true,
});
```

**Migration Guide:**

1. **Replace app creation:**
   - Old: `createAgentRuntime(meta, options)`
   - New: `await createAgent(meta).use(extensions).build()`

2. **Replace HTTP runtime:**
   - Old: `createAgentHttpRuntime(meta, options)`
   - New: `await createAgent(meta).use(http()).build()`

3. **Update imports:**
   - Import `http` from `@lucid-agents/http` instead of `@lucid-agents/core`
   - Import `ZodValidationError` from `@lucid-agents/types/core` instead of `@lucid-agents/core`
   - Import `InvokeResult` from `@lucid-agents/http` instead of `@lucid-agents/core` (if needed)

4. **Update AgentContext usage:**
   - Old: `ctx.headers.get('authorization')`
   - New: `(ctx.metadata?.headers as Headers)?.get('authorization')` or `ctx.metadata?.headers` (HTTP extension provides this)

5. **Update manifest building:**
   - Old: `agent.resolveManifest(origin, basePath)`
   - New: `agent.manifest.build(origin)`

6. **Remove core invoke/stream calls:**
   - Old: `agent.agent.invoke(key, input, ctx)`
   - New: Use HTTP handlers or `invokeHandler` from `@lucid-agents/http` for direct calls

7. **Update identity usage:**
   - Old: `createAgentIdentity({ domain, autoRegister })` (standalone, no runtime required)
   - New: `createAgentIdentity({ runtime: agent, domain, autoRegister })` (requires runtime parameter)
   - **Recommended**: Use automatic mode with `identity({ config: identityFromEnv() })` in extension chain
   - New helper: `identityFromEnv()` loads config from `AGENT_DOMAIN`, `RPC_URL`, `CHAIN_ID`, `REGISTER_IDENTITY` env vars

8. **Update CLI templates and examples** to use new extension API
