# Migration Guide: ERC-8004 January 2026 Specification Update

This guide helps you migrate your code from the previous ERC-8004 implementation to the January 2026 specification update.

## Overview

The January 2026 spec update introduces breaking changes to align with the latest ERC-8004 standard:

- **Reputation Registry**: Replaced `score` with `value` + `valueDecimals`, removed `feedbackAuth`, changed tags from `bytes32`/`Hex` to `string`, added optional `endpoint` parameter (defaults to empty string if not provided)
- **Identity Registry**: Renamed `tokenURI` to `agentURI` throughout
- **Validation Registry**: Deprecated and removed from default client creation (under active development). Function names changed (`createRequest` → `validationRequest`, `submitResponse` → `validationResponse`). Tag types changed from `bytes32`/`Hex` to `string` in `getSummary()`, `getValidationStatus()`, and `validationResponse()`

## Breaking Changes Summary

### 1. Reputation Registry `giveFeedback()`

**Before:**

```typescript
await reputationClient.giveFeedback({
  toAgentId: 42n,
  score: 90,
  tag1: '0x1234...', // Hex/bytes32
  tag2: '0x5678...', // Hex/bytes32
  feedbackUri: 'ipfs://...',
  feedbackHash: '0x...',
  feedbackAuth: '0x...', // Required pre-authorization
  expiry: Math.floor(Date.now() / 1000) + 3600,
  indexLimit: 1000n,
});
```

**After:**

```typescript
await reputationClient.giveFeedback({
  toAgentId: 42n,
  value: 90,
  valueDecimals: 0,
  tag1: 'reliable', // String
  tag2: 'fast', // String
  endpoint: 'https://agent.example.com', // Optional parameter (defaults to empty string if not provided)
  feedbackURI: 'ipfs://...', // Optional, defaults to empty string
  feedbackHash: '0x...', // Optional
  // feedbackAuth, expiry, indexLimit removed
});
```

### 2. Reputation Registry `getFeedback()` and `getAllFeedback()`

**Before:**

```typescript
const feedback = await reputationClient.getFeedback(42n, clientAddress, 0n);
// feedback.tag1 and feedback.tag2 are Hex/bytes32

const allFeedback = await reputationClient.getAllFeedback(42n, {
  tag1: '0x1234...', // Hex/bytes32
  tag2: '0x5678...', // Hex/bytes32
});
// feedbackIndex is derived from array index
```

**After:**

```typescript
const feedback = await reputationClient.getFeedback(42n, clientAddress, 0n);
// feedback.tag1 and feedback.tag2 are strings

const allFeedback = await reputationClient.getAllFeedback(42n, {
  tag1: 'reliable', // String
  tag2: 'fast', // String
});
// feedbackIndex comes from contract (first element of readAllFeedback return)
```

### 3. Identity Registry `tokenURI` → `agentURI`

**Before:**

```typescript
const record = await identityClient.get(42n);
console.log(record.tokenURI); // Uses tokenURI

await identityClient.register({
  tokenURI: 'https://agent.example.com/.well-known/agent-registration.json',
});

const entry = identityClient.toRegistrationEntry(record);
console.log(entry.tokenURI); // Uses tokenURI in RegistrationEntry
```

**After:**

```typescript
const record = await identityClient.get(42n);
console.log(record.agentURI); // Now uses agentURI

await identityClient.register({
  agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
});

const entry = identityClient.toRegistrationEntry(record);
console.log(entry.agentURI); // Now uses agentURI in RegistrationEntry

// New function: setAgentURI()
await identityClient.setAgentURI(
  42n,
  'https://new-agent.example.com/.well-known/agent-registration.json'
);
```

### 3.1. Registration entries now include `agentRegistry`

**Before:**

```typescript
const trustConfig = {
  registrations: [
    { agentId: '1', agentAddress: 'eip155:84532:0xabc' },
  ],
};
```

**After:**

```typescript
const trustConfig = {
  registrations: [
    {
      agentId: '1',
      agentRegistry: 'eip155:84532:0xregistry',
      agentAddress: 'eip155:84532:0xabc', // optional legacy field
    },
  ],
};
```

`buildTrustConfigFromIdentity()` now requires `registryAddress` so it can populate `agentRegistry`.

### 4. Validation Registry Deprecation

**Before:**

```typescript
const identity = await createAgentIdentity({ autoRegister: true });
// identity.clients.validation is always available

await identity.clients.validation.createRequest({
  validatorAddress: '0x...',
  agentId: identity.record!.agentId,
  requestUri: 'ipfs://...',
});

await identity.clients.validation.submitResponse({
  requestHash: '0xabc...',
  response: 1,
  responseUri: 'ipfs://...',
  responseHash: '0x...',
  tag: '0x0000...0000', // bytes32
});

const summary = await identity.clients.validation.getSummary(agentId, {
  tag: '0x0000...0000', // bytes32
});
```

**After:**

```typescript
const identity = await createAgentIdentity({ autoRegister: true });
// identity.clients.validation is now optional (undefined by default)

// If you need Validation Registry for backward compatibility:
if (identity.clients?.validation) {
  // Function names changed: createRequest → validationRequest
  await identity.clients.validation.validationRequest({
    validatorAddress: '0x...',
    agentId: identity.record!.agentId,
    requestUri: 'ipfs://...',
    requestBody: '{"input":"work-data"}', // preferred for hashing
    // requestHash: '0xabc...', // optional if you already computed it
  });

  // Function names changed: submitResponse → validationResponse
  // Tag type changed: bytes32/Hex → string
  await identity.clients.validation.validationResponse({
    requestHash: '0xabc...',
    response: 1,
    responseUri: 'ipfs://...',
    responseHash: '0x...',
    tag: 'validation', // Now a string, not bytes32
  });

  // Tag type changed: bytes32/Hex → string
  const summary = await identity.clients.validation.getSummary(agentId, {
    tag: 'validation', // Now a string, not bytes32
  });
}

// Note: Validation Registry is under active development and will be
// revised in a follow-up spec update later this year.
// If requestBody is omitted, the client hashes requestUri for backward compatibility.
```

### 5. Contract Addresses

**Before:**

```typescript
// Multiple chains supported
const addresses = getRegistryAddresses(84532); // Base Sepolia
const addresses2 = getRegistryAddresses(59141); // Linea Sepolia
```

**After:**

```typescript
// Only ETH Sepolia is deployed with Jan 2026 spec addresses
const addresses = getRegistryAddresses(11155111); // ETH Sepolia

// Other chains are commented out until new contracts are deployed
// getRegistryAddresses(84532); // Error: Chain not supported
```

## Step-by-Step Migration Checklist

### Step 1: Update Reputation Registry Calls

- [ ] Remove `feedbackAuth` parameter from all `giveFeedback()` calls
- [ ] Remove `expiry` and `indexLimit` parameters
- [ ] Convert tag parameters from `Hex`/`bytes32` to `string`
- [ ] Optionally add `endpoint` parameter to `giveFeedback()` calls (optional, defaults to empty string)
- [ ] Rename `feedbackUri` to `feedbackURI` (optional parameter)
- [ ] Update `getSummary()` calls to use string tags
- [ ] Update `getAllFeedback()` calls to use string tags

### Step 2: Update Identity Registry Calls

- [ ] Replace all `tokenURI` references with `agentURI`
- [ ] Update `register()` calls to use `agentURI` parameter
- [ ] Update code that reads `IdentityRecord.tokenURI` to use `agentURI`
- [ ] Update code that uses `RegistrationEntry.tokenURI` to use `agentURI`
- [ ] Use new `setAgentURI()` function for updating agent URIs

### Step 3: Handle Validation Registry Deprecation

- [ ] Check if your code uses `identity.clients.validation`
- [ ] Add conditional checks: `if (identity.clients?.validation) { ... }`
- [ ] Consider alternative approaches while Validation Registry is under development
- [ ] Add comments explaining the deprecation

### Step 4: Update Contract Addresses

- [ ] Ensure you're using ETH Sepolia (chainId: 11155111) for testing
- [ ] Update any hardcoded contract addresses to new ETH Sepolia addresses
- [ ] Wait for new deployments on other chains before enabling them

### Step 5: Update Tests

- [ ] Replace `tokenURI` with `agentURI` in all test assertions
- [ ] Remove `feedbackAuth` from test inputs
- [ ] Update tag types from `Hex` to `string` in tests
- [ ] Optionally add `endpoint` parameter to `giveFeedback()` test calls (optional, defaults to empty string)
- [ ] Update test expectations for `getAllFeedback()` return values
- [ ] Update `score` usages to `value` + `valueDecimals` (and adjust any average score math)

## Common Issues and Solutions

### Issue: TypeScript Error - Property 'tokenURI' does not exist

**Solution:**

```typescript
// Before
const uri = record.tokenURI;

// After
const uri = record.agentURI;
```

### Issue: TypeScript Error - Type 'Hex' is not assignable to type 'string'

**Solution:**

```typescript
// Before
await reputationClient.giveFeedback({
  tag1: '0x1234...' as Hex,
});

// After
await reputationClient.giveFeedback({
  toAgentId: 42n,
  value: 90,
  valueDecimals: 0,
  tag1: 'reliable', // Use string directly
  // endpoint is optional (defaults to empty string if not provided)
});
```

### Issue: Missing 'feedbackAuth' Error

**Solution:**
Simply remove the `feedbackAuth` parameter. The new spec doesn't require pre-authorization:

```typescript
// Before
const feedbackAuth = await signFeedbackAuth(...);
await reputationClient.giveFeedback({ ..., feedbackAuth });

// After
await reputationClient.giveFeedback({
  toAgentId: 42n,
  value: 90,
  valueDecimals: 0,
  // endpoint is optional (defaults to empty string if not provided)
  // No feedbackAuth needed
});
```

### Issue: Validation Registry is undefined

**Solution:**
Add optional chaining or conditional checks:

```typescript
// Before
await identity.clients.validation.createRequest(...);
await identity.clients.validation.submitResponse({ tag: '0x...' });

// After
if (identity.clients?.validation) {
  // Function names changed: createRequest → validationRequest, submitResponse → validationResponse
  // Tag types changed: bytes32/Hex → string
  await identity.clients.validation.validationRequest(...);
  await identity.clients.validation.validationResponse({ tag: 'validation' });
} else {
  console.warn('Validation Registry not available (deprecated)');
}
```

### Issue: feedbackIndex Mismatch

**Solution:**
The `feedbackIndex` in `getAllFeedback()` now comes from the contract, not the array index:

```typescript
// Before
const feedback = await getAllFeedback(42n);
// feedback[i].feedbackIndex === BigInt(i)

// After
const feedback = await getAllFeedback(42n);
// feedback[i].feedbackIndex comes from contract's feedbackIndexes array
```

## Version Compatibility

- **Minimum version**: `@lucid-agents/identity@2.0.0` (Jan 2026 spec)
- **Previous version**: `@lucid-agents/identity@1.x.x` (pre-Jan 2026 spec)

This is a **major version bump** with breaking changes. Update your code following this migration guide.

## New Features

### 1. `setAgentURI()` Function

```typescript
// Update an agent's URI after registration
await identityClient.setAgentURI(
  42n,
  'https://new-uri.example.com/.well-known/agent-registration.json'
);
```

### 2. `getVersion()` Function

```typescript
// Check contract version for compatibility
const version = await identityClient.getVersion();
console.log(`Identity Registry version: ${version}`);

const repVersion = await reputationClient.getVersion();
console.log(`Reputation Registry version: ${repVersion}`);
```

### 3. Reserved Metadata Key Protection

```typescript
// agentWallet is now protected
try {
  await identityClient.setMetadata(42n, 'agentWallet', new Uint8Array([...]));
} catch (error) {
  // Error: agentWallet is a reserved metadata key...
  // Use setAgentWallet() with signature proof instead
}
```

## Getting Help

If you encounter issues during migration:

1. Check this migration guide for common solutions
2. Review the [CHANGELOG.md](./CHANGELOG.md) for detailed change list
3. Check the [README.md](./README.md) for updated examples
4. Open an issue on GitHub with your specific error

## Timeline

- **January 2026**: ERC-8004 Jan 2026 spec update released
- **January 2026**: New contracts deployed on ETH Sepolia
- **Later 2026**: Validation Registry spec revision expected
- **Future**: New contracts deployed on other chains (Base, Linea, etc.)
