---
"@lucid-agents/payments": patch
"@lucid-agents/core": patch
"@lucid-agents/types": patch
"@lucid-agents/analytics": patch
"@lucid-agents/a2a": patch
"@lucid-agents/http": patch
"@lucid-agents/scheduler": patch
---

Add Postgres storage backend, multi-agent support, and refine extension API structure

## New Features

### Postgres Storage Backend for Payments

- Added `PostgresPaymentStorage` class for persistent payment storage
- Supports connection pooling and automatic schema initialization
- Ideal for serverless deployments and multi-instance setups
- Docker Compose setup for local development
- CI integration with Postgres test database

### Multi-Agent Support

- Added optional `agentId` parameter to payments extension for multi-agent isolation
- Multiple agents can now share the same Postgres database with complete payment isolation
- Backward compatible - existing single-agent deployments continue to work unchanged
- Database queries automatically filter by `agentId` when provided

### API Structure Refinements

- Added `agentId` parameter to `payments()` extension factory
- Added `storageFactory` parameter for custom storage implementations
- Refined extension runtime types for stricter type safety:
  - `a2a()` extension now returns `{ a2a: A2ARuntime }` instead of optional
  - `analytics()` extension now returns `{ analytics: AnalyticsRuntime }` instead of direct runtime
  - `scheduler()` extension now returns `{ scheduler: SchedulerRuntime }` instead of optional
- Moved `Network` type from `@lucid-agents/core` to `@lucid-agents/types/core` for better organization

## Migration

No breaking changes. Existing code continues to work. To enable multi-agent support, pass `agentId` when creating the payments extension:

```typescript
.use(payments({
  config: { /* ... */ },
  agentId: 'my-agent-id' // Optional, for multi-agent isolation
}))
```
