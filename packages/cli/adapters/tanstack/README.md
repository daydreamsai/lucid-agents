# TanStack Start Adapter Base Layers

This directory contains base project structures for generating TanStack Start-based agents.

## Variants

### UI Variant (`tanstack/ui/`)

Full-stack React application with:

- TanStack Router (file-based routing)
- TanStack Query (data fetching)
- Tailwind CSS styling
- Reown AppKit wallet integration
- Pre-built dashboard UI
- Schema forms for testing entrypoints

### Headless Variant (`tanstack/headless/`)

API-only version without UI components:

- TanStack Router for API routes only
- No React components or styling
- Minimal bundle size
- Perfect for backend-only agents

## Structure

Both variants include:

```
src/
├── routes/
│   └── api/agent/         # Agent API routes
│       ├── health.ts
│       ├── entrypoints.ts
│       └── entrypoints/$key/
│           ├── invoke.ts
│           └── stream.ts
├── lib/
│   └── agent.ts           # Agent definition with placeholders
```

## Placeholders

The `src/lib/agent.ts` file contains placeholders that are replaced during generation:

- `{{ADAPTER_IMPORTS}}` - Framework imports (TanStack runtime)
- `{{ADAPTER_PRE_SETUP}}` - Template feature setup
- `{{ADAPTER_APP_CREATION}}` - Runtime creation
- `{{ADAPTER_ENTRYPOINT_REGISTRATION}}` - Example entrypoint
- `{{ADAPTER_POST_SETUP}}` - Template cleanup/exports
- `{{ADAPTER_EXPORTS}}` - Export runtime and handlers

## Usage

```bash
# UI variant (full dashboard)
cli my-agent --adapter=tanstack-ui

# Headless variant (API only)
cli my-agent --adapter=tanstack-headless
```
