---
"@lucid-agents/payments": minor
"@lucid-agents/express": minor
"@lucid-agents/hono": minor
---

Migrate to x402 v2 protocol and remove v1 backwards compatibility

## Breaking Changes

### x402 v1 protocol support removed

The following v1 backwards compatibility has been removed:

**Request headers no longer supported:**
- `X-Price` - Use `PAYMENT-REQUIRED` header instead
- `X-Pay-To` - Use `PAYMENT-REQUIRED` header instead
- `X-Network` - Use `PAYMENT-REQUIRED` header instead
- `X-Facilitator` - Use `PAYMENT-REQUIRED` header instead

**Response headers no longer supported:**
- `X-PAYMENT-RESPONSE` - Use `PAYMENT-RESPONSE` header instead

**Payment requirements format:**
- `maxAmountRequired` field removed - Use `amount` instead
- Network must use CAIP-2 format (e.g., `eip155:84532` not `base-sepolia`)
- `extra.name` and `extra.version` required for EIP-712 signing

### Replaced legacy packages with @x402/* packages

- `@x402/core` - Core x402 protocol types
- `@x402/fetch` - Payment-wrapped fetch with `wrapFetchWithPayment` and `x402Client`
- `@x402/evm` - EVM signer support with `ExactEvmScheme` and `toClientEvmSigner`

## Migration Guide

### For raw x402 usage

Before (v1):
```typescript
import { wrapFetchWithX402, createWallet } from 'x402-fetch';
const wallet = createWallet(privateKey, 'base');
const x402Fetch = wrapFetchWithX402(fetch, wallet);
```

After (v2):
```typescript
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(privateKey);
const signer = toClientEvmSigner(account);
const client = new x402Client()
  .register('eip155:8453', new ExactEvmScheme(signer));  // Base
const x402Fetch = wrapFetchWithPayment(fetch, client);
```

### For server-side payment handling

Before (v1 headers):
```typescript
// Response with v1 headers
res.setHeader('X-Price', '1.00');
res.setHeader('X-Pay-To', '0x...');
```

After (v2 PAYMENT-REQUIRED header):
```typescript
// Payment requirements now in base64-encoded PAYMENT-REQUIRED header
// This is handled automatically by the x402-express/x402-hono middleware
```

**No changes needed** if you use the `createX402Fetch` and `accountFromPrivateKey` helpers -
they now use the new packages internally.

## Supported Networks

- `eip155:8453` - Base mainnet
- `eip155:84532` - Base Sepolia
- `eip155:1` - Ethereum mainnet
- `eip155:11155111` - Ethereum Sepolia
