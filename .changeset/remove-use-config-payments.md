---
'@lucid-agents/core': major
'@lucid-agents/hono': major
'@lucid-agents/tanstack': major
'@lucid-agents/cli': patch
---

**BREAKING**: Remove `useConfigPayments` option - payments must be explicitly configured

The `useConfigPayments` flag has been removed from `CreateAgentHttpOptions`. Payment configuration is now explicit and clearer.

**Migration:**

Before:
```typescript
createAgentApp(meta, {
  config: { payments: { ... } },
  useConfigPayments: true
});
```

After:
```typescript
createAgentApp(meta, {
  payments: {
    facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS,
    network: process.env.PAYMENTS_NETWORK,
    defaultPrice: process.env.PAYMENTS_DEFAULT_PRICE,
  }
});
```

**Benefits:**
- Clearer payment configuration (explicit, not magic)
- Better separation of concerns (core doesn't auto-apply payment defaults)
- Easier to understand what entrypoints have payments

