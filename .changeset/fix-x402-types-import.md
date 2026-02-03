---
"@lucid-agents/payments": patch
---

Fix remaining x402/types imports that were missed in v2 migration

The previous release (2.3.0) still had imports from `x402/types` which is not installed:
- `payments.ts` - `import type { Network } from 'x402/types'`
- `validation.ts` - `SupportedEVMNetworks`, `SupportedSVMNetworks`, `Network`

Fixed by:
- Changed Network type import to use `@x402/core/types`
- Defined supported networks locally with CAIP-2 format
