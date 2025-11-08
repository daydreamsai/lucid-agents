## {{AGENT_NAME}}

This project was scaffolded with `create-agent-kit` and ships with a ready-to-run agent app built on [`@lucid-agents/agent-kit`](https://www.npmjs.com/package/@lucid-agents/agent-kit).

### Quick start

```sh
bun install
bun run dev
```

The dev command runs `bun` in watch mode, starts the HTTP server, and reloads when you change files inside `src/`.

### Project structure

- `src/agent.ts` – defines your agent manifest and entrypoints.
- `src/index.ts` – boots a Bun HTTP server with the agent.

### Available scripts

- `bun run dev` – start the agent in watch mode.
- `bun run start` – start the agent once.
- `bun run agent` – run the agent module directly (helpful for quick experiments).
- `bunx tsc --noEmit` – type-check the project.

### Next steps

- Update `src/agent.ts` with your use case.
- Wire up `@lucid-agents/agent-kit` configuration and secrets (see `AGENTS.md` in the repo for details).
- Copy `.env.example` to `.env` and fill in the values for your environment.
- Deploy with your preferred Bun-compatible platform when you're ready.
