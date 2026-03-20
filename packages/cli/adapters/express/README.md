# Express Adapter Base Layer

This directory contains the base project structure for generating Express-based agents.

## Structure

```
express/
├── package.json         # Base dependencies (Express, core, etc.)
├── tsconfig.json        # TypeScript configuration
├── src/
│   ├── index.ts         # Server entry point
│   └── lib/
│       └── agent.ts     # Agent definition with placeholders
```

## Placeholders

The `src/lib/agent.ts` file contains placeholders that are replaced during generation:

- `{{ADAPTER_IMPORTS}}` - Framework imports (Express createAgentApp)
- `{{ADAPTER_PRE_SETUP}}` - Template feature setup (payments, identity, etc.)
- `{{ADAPTER_APP_CREATION}}` - App creation call
- `{{ADAPTER_ENTRYPOINT_REGISTRATION}}` - Example entrypoint
- `{{ADAPTER_POST_SETUP}}` - Template cleanup/exports
- `{{ADAPTER_EXPORTS}}` - Export app

## Usage

This base layer is automatically used when running:

```bash
bunx @lucid-agents/cli my-agent --adapter=express
```

The CLI will:

1. Copy this base layer to the target directory
2. Inject template feature logic into the placeholders
3. Merge package dependencies
4. Generate .env file
