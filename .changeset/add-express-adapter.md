---
'@lucid-agents/express': patch
'@lucid-agents/cli': patch
'@lucid-agents/core': patch
---

# Express Adapter Support

Adds first-class Express adapter with x402 payments, scaffolding templates, and comprehensive documentation.

## New Features

### Express Adapter Package

- New `@lucid-agents/express` package with full Express integration
- x402-express paywalling middleware for monetized endpoints
- Request/response bridges for Express to agent runtime
- Comprehensive smoke tests validating Express adapter functionality

### CLI Integration

- Express adapter available via `--adapter=express` flag
- Scaffolding assets and template support for Express projects
- Interactive adapter selection includes Express option
- Example: `bunx @lucid-agents/cli my-agent --adapter=express --template=blank`

### Documentation

- Updated CLI README with Express adapter examples
- Added Express adapter documentation to core package README
- Express-specific setup guides and configuration examples
- Clarified adapter selection in CLI documentation

## Improvements

### AxLLM Client Configuration

- Stop enabling streaming by default in `createAxLLMClient`
- Generated AxLLM clients now only opt into streaming when explicitly requested via overrides
- More predictable behavior for non-streaming use cases

### Build Configuration

- Added `@lucid-agents/express` to build order in `scripts/build-packages.ts`
- Proper TypeScript configuration for express package
- Consistent tsup configuration with other adapters

## Backward Compatibility

This change adds new functionality without breaking existing adapters. Projects using Hono, TanStack, or Next.js adapters are unaffected.
