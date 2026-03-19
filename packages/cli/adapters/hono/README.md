# Hono Adapter Base Layer

This directory contains the base project structure for generating Hono-based agents.

## Structure

```
hono/
├── package.json         # Base dependencies (Hono, core, etc.)
├── tsconfig.json        # TypeScript configuration
├── src/
│   ├── index.ts         # Bun server entry point
│   └── lib/
│       └── agent.ts     # Agent definition with placeholders
```

## Placeholders

The `src/lib/agent.ts` file contains placeholders that are replaced during generation:

- `{{ADAPTER_IMPORTS}}` - Framework imports (Hono createAgentApp)
- `{{ADAPTER_PRE_SETUP}}` - Template feature setup (payments, identity, etc.)
- `{{ADAPTER_APP_CREATION}}` - App creation call
- `{{ADAPTER_ENTRYPOINT_REGISTRATION}}` - Example entrypoint
- `{{ADAPTER_POST_SETUP}}` - Template cleanup/exports
- `{{ADAPTER_EXPORTS}}` - Export app

## Usage

This base layer is automatically used when running:

```bash
cli my-agent --adapter=hono
```

The CLI will:

1. Copy this base layer to the target directory
2. Inject template feature logic into the placeholders
3. Merge package dependencies
4. Generate .env file
