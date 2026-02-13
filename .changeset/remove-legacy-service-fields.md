---
'@lucid-agents/types': minor
'@lucid-agents/identity': minor
'@lucid-agents/cli': minor
---

**BREAKING CHANGE**: Remove backward compatibility for legacy service field names and registration types.

## AgentService type changes

The `AgentService` type now only accepts canonical field names:

**Before:**
```typescript
// Both formats were accepted:
{ id: 'A2A', serviceEndpoint: 'https://...' }  // legacy
{ name: 'A2A', endpoint: 'https://...' }       // canonical
```

**After:**
```typescript
// Only canonical format accepted:
{ name: 'A2A', endpoint: 'https://...' }
```

**Migration:** Update all service definitions to use `name` instead of `id`/`type`, and `endpoint` instead of `serviceEndpoint`.

## AgentRegistration type changes

The `AgentRegistration.type` field now only accepts the ERC-8004 URL format:

**Before:**
```typescript
type: 'agent' | 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
```

**After:**
```typescript
type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
```

The `type` field is now automatically set to the correct value and cannot be overridden.

## Code changes

- Removed `normalizeServiceInput()` function that converted legacy fields to canonical fields
- Removed `AgentRegistrationOptions.type` field (type is now always set to ERC-8004 URL)
- Simplified service validation to require canonical fields
- Updated all documentation and examples to use new format

## Why this change?

The dual-format support added unnecessary complexity without clear benefit. A clean break ensures:
- Simpler, more maintainable code
- Clearer API documentation
- No confusion about which format to use
- Compliance with ERC-8004 standard
