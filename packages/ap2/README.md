# @lucid-agents/ap2

Adds an AP2 v0.1 role descriptor to a Lucid Agent Card.

This package is metadata-only. It does not implement AP2 mandates,
human-present or human-not-present flows, credentials, checkout, deterministic
verification, receipts, disputes, payment authorization, or settlement.
Upstream AP2 is now v0.2; this package still emits the v0.1 URI and does not
claim v0.2 interoperability.

## Install

```bash
bun add @lucid-agents/ap2
```

## Runtime extension

```typescript
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const runtime = await createAgent({
  name: 'merchant',
  version: '1.0.0',
})
  .use(
    ap2({
      roles: ['merchant'],
      description: 'Sells typed research capabilities',
      required: true,
    })
  )
  .use(http())
  .build();

console.log(runtime.ap2?.config.roles);
```

Supported role labels are `merchant`, `shopper`, `credentials-provider`, and
`payment-processor`. They are self-declared discovery metadata, not proof of a
working commercial flow.

The generated descriptor looks like:

```json
{
  "uri": "https://github.com/google-agentic-commerce/ap2/tree/v0.1",
  "description": "Sells typed research capabilities",
  "required": true,
  "params": { "roles": ["merchant"] }
}
```

An empty role array adds no descriptor. A merchant descriptor defaults to
`required: true`; other roles default to `false`. Rebuilding a card replaces an
existing Lucid AP2 descriptor while preserving unrelated extensions.

## Standalone API

```typescript
import {
  AP2_EXTENSION_URI,
  createAgentCardWithAP2,
  createAP2Runtime,
} from '@lucid-agents/ap2';

const ap2Runtime = createAP2Runtime({ roles: ['shopper'] });
const cardWithRoles = createAgentCardWithAP2(card, {
  roles: ['shopper'],
});
```

The package exports `AP2Config`, `AP2ExtensionDescriptor`,
`AP2ExtensionParams`, and `AP2Role` types.

Use `@lucid-agents/payments` or `@lucid-agents/mpp` for payment enforcement.
Those packages do not turn this descriptor into AP2 authorization. See the
[upstream AP2 specification](https://ap2-protocol.org/ap2/specification/) and
the Lucid [protocol boundary](https://docs.daydreams.systems/docs/protocols/ap2).
