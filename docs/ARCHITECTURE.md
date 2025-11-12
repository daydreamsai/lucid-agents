# Lucid Agents - SDK Architecture

High-level architecture overview of the Lucid Agents SDK.

## Package Structure

The SDK is organized into four architectural layers:

```mermaid
graph TB
    subgraph "Layer 1: Extensions"
        identity["@lucid-agents/agent-kit-identity<br/>ERC-8004 identity & trust"]
        payments["@lucid-agents/agent-kit-payments<br/>x402 bi-directional payments"]
        future["Future extensions<br/>(wallet, monitoring, etc.)"]
    end

    subgraph "Layer 2: Core"
        core["@lucid-agents/agent-kit<br/>Core runtime & types"]
    end

    subgraph "Layer 3: Adapters"
        hono["@lucid-agents/agent-kit-hono<br/>Hono framework adapter"]
        tanstack["@lucid-agents/agent-kit-tanstack<br/>TanStack Start adapter"]
        express["Future: Express adapter"]
    end

    subgraph "Layer 4: Developer Tools"
        cli["@lucid-agents/create-agent-kit<br/>CLI scaffolding tool"]
        templates["Templates<br/>(blank, axllm, identity, etc.)"]
    end

    core --> identity
    core --> payments

    hono --> core
    tanstack --> core
    express -.-> core

    cli --> hono
    cli --> tanstack
    cli --> templates

    style identity fill:#e1f5ff
    style payments fill:#e1f5ff
    style future fill:#f0f0f0,stroke-dasharray: 5 5
    style core fill:#fff4e1
    style hono fill:#e8f5e9
    style tanstack fill:#e8f5e9
    style express fill:#f0f0f0,stroke-dasharray: 5 5
    style cli fill:#f3e5f5
    style templates fill:#f3e5f5
```

## Dependency Graph

```mermaid
graph LR
    subgraph "Extensions (Independent)"
        identity[agent-kit-identity]
        payments[agent-kit-payments]
    end

    subgraph "Core Runtime"
        core[agent-kit]
    end

    subgraph "Framework Adapters"
        hono[agent-kit-hono]
        tanstack[agent-kit-tanstack]
    end

    subgraph "Developer Tools"
        cli[create-agent-kit]
    end

    core --> payments
    core --> identity

    hono --> core
    tanstack --> core

    cli --> hono
    cli --> tanstack

    style identity fill:#81c784
    style payments fill:#81c784
    style core fill:#ffb74d
    style hono fill:#ba68c8
    style tanstack fill:#ba68c8
    style cli fill:#e57373
```

## Layer 1: Extensions

Extensions add optional capabilities. They are independent and don't depend on each other.

### @lucid-agents/agent-kit-identity

**Purpose:** ERC-8004 on-chain identity and trust layer

**Provides:**

- Registry clients (Identity, Reputation, Validation)
- Trust configuration
- Domain proof signing
- `createAgentIdentity()` bootstrap function

**Dependencies:** `viem` (Ethereum interactions)

---

### @lucid-agents/agent-kit-payments

**Purpose:** x402 payment protocol (bi-directional)

**Provides:**

- Entrypoint definitions (priced capabilities)
- Payment requirement resolution (server-side)
- x402 client utilities (client-side)
- AxLLM integration with payments
- Payment configuration and validation

**Dependencies:** `x402`, `x402-fetch`, `@ax-llm/ax`, `@lucid-dreams/agent-auth`, `zod`

## Layer 2: Core

### @lucid-agents/agent-kit

**Purpose:** Framework-agnostic agent runtime

**Provides:**

- Agent execution (`AgentCore`)
- HTTP request handlers
- Server-Sent Events (SSE) streaming
- Manifest generation (AgentCard, A2A)
- Configuration management
- Landing page UI
- AxLLM client wrapper

**Dependencies:** `agent-kit-payments`, `agent-kit-identity`

## Layer 3: Adapters

Adapters integrate the core runtime with specific web frameworks.

### @lucid-agents/agent-kit-hono

**Purpose:** Hono framework integration

**Provides:**

- `createAgentApp()` - Returns Hono app instance
- `withPayments()` - x402-hono middleware wrapper

**Dependencies:** `agent-kit`, `hono`, `x402-hono`

---

### @lucid-agents/agent-kit-tanstack

**Purpose:** TanStack Start framework integration

**Provides:**

- `createTanStackRuntime()` - Returns runtime & handlers
- `withPayments()` - x402-tanstack middleware wrapper

**Dependencies:** `agent-kit`, `@tanstack/start`, `x402-tanstack`

## Layer 4: Developer Tools

### @lucid-agents/create-agent-kit

**Purpose:** CLI for scaffolding new agent projects

**Provides:**

- Interactive project wizard
- Template system (blank, axllm, identity, axllm-flow)
- Adapter selection (hono, tanstack-ui, tanstack-headless)
- Merge system (combines adapter + template)

**Dependencies:** All agent-kit packages

## Developer Flow

```mermaid
graph TB
    dev[Developer]

    dev -->|1. Runs| cli[create-agent-kit CLI]
    cli -->|2. Selects| adapter{Choose Adapter}
    cli -->|3. Selects| template{Choose Template}

    adapter -->|hono| hono_files[Hono Base Files]
    adapter -->|tanstack| ts_files[TanStack Base Files]

    template -->|blank| t_blank[Blank Template]
    template -->|axllm| t_axllm[AxLLM Template]
    template -->|identity| t_identity[Identity Template]

    hono_files --> merge[Merge System]
    ts_files --> merge
    t_blank --> merge
    t_axllm --> merge
    t_identity --> merge

    merge -->|4. Generates| project[Agent Project]

    project -->|5. Uses| runtime[agent-kit + adapters]
    runtime -->|6. Optionally uses| extensions[Extensions<br/>payments, identity]

    style dev fill:#fff
    style cli fill:#f48fb1
    style project fill:#81c784
    style runtime fill:#ffcc80
    style extensions fill:#90caf9
```

## Request Flow

How an HTTP request flows through the system:

```mermaid
sequenceDiagram
    participant Client
    participant Adapter as Framework Adapter
    participant Paywall as x402 Middleware
    participant Runtime as agent-kit Runtime
    participant Core as AgentCore
    participant Handler as User Handler

    Client->>Adapter: HTTP Request
    Adapter->>Paywall: Check payment (if enabled)

    alt Payment Required & Invalid
        Paywall-->>Client: 402 Payment Required
    end

    Paywall->>Runtime: Request approved
    Runtime->>Runtime: Validate input schema

    alt Invalid Input
        Runtime-->>Client: 400 Bad Request
    end

    Runtime->>Core: Execute entrypoint
    Core->>Handler: Call user's handler
    Handler-->>Core: Return output
    Core-->>Runtime: Execution result
    Runtime-->>Adapter: Format response
    Adapter-->>Client: 200 OK + JSON
```

## Build Order

Packages must build in dependency order:

```mermaid
graph LR
    A[1. x402-tanstack-start] --> B[2. agent-kit-identity]
    B --> C[3. agent-kit-payments]
    C --> D[4. agent-kit]
    D --> E[5. agent-kit-hono]
    D --> F[6. agent-kit-tanstack]
    E --> G[7. create-agent-kit]
    F --> G

    style A fill:#b39ddb
    style B fill:#90caf9
    style C fill:#a5d6a7
    style D fill:#ffcc80
    style E fill:#ce93d8
    style F fill:#ce93d8
    style G fill:#ef9a9a
```

## Package Responsibilities

| Package              | Responsibility                                               |
| -------------------- | ------------------------------------------------------------ |
| `agent-kit-identity` | ERC-8004 on-chain identity, registries, trust models         |
| `agent-kit-payments` | x402 protocol, EntrypointDef, pricing, payment client/server |
| `agent-kit`          | Core runtime, HTTP handlers, SSE, manifest, config, UI       |
| `agent-kit-hono`     | Hono framework integration, middleware wiring                |
| `agent-kit-tanstack` | TanStack framework integration, middleware wiring            |
| `create-agent-kit`   | CLI tool, templates, project scaffolding                     |

## Extension Independence

```mermaid
graph TB
    subgraph "Independent Extensions"
        identity[agent-kit-identity<br/>Can be used without payments]
        payments[agent-kit-payments<br/>Can be used without identity]
    end

    subgraph "Core"
        core[agent-kit<br/>Uses both extensions]
    end

    identity -.->|optional| core
    payments -.->|optional| core

    style identity fill:#90caf9
    style payments fill:#a5d6a7
    style core fill:#ffcc80
```

Extensions are independent modules that core can optionally use. Neither depends on the other.

## Future Roadmap

Planned extensions and adapters:

```mermaid
graph TB
    subgraph "Existing"
        identity_now[agent-kit-identity]
        payments_now[agent-kit-payments]
        core_now[agent-kit]
        hono_now[agent-kit-hono]
        tanstack_now[agent-kit-tanstack]
    end

    subgraph "Planned Extensions"
        wallet[agent-kit-wallet<br/>Agent wallet management]
        monitoring[agent-kit-monitoring<br/>Metrics & observability]
        storage[agent-kit-storage<br/>Persistent state]
        axllm_pkg[agent-kit-axllm<br/>Dedicated LLM package]
    end

    subgraph "Planned Adapters"
        express[agent-kit-express]
        fastify[agent-kit-fastify]
        nextjs[agent-kit-nextjs]
    end

    core_now --> wallet
    core_now --> monitoring
    core_now --> storage
    core_now --> axllm_pkg

    core_now --> express
    core_now --> fastify
    core_now --> nextjs

    style wallet fill:#fff59d,stroke-dasharray: 5 5
    style monitoring fill:#fff59d,stroke-dasharray: 5 5
    style storage fill:#fff59d,stroke-dasharray: 5 5
    style axllm_pkg fill:#fff59d,stroke-dasharray: 5 5
    style express fill:#e1bee7,stroke-dasharray: 5 5
    style fastify fill:#e1bee7,stroke-dasharray: 5 5
    style nextjs fill:#e1bee7,stroke-dasharray: 5 5
```

## Summary

The Lucid Agents SDK follows a **layered, modular architecture**:

1. **Extensions** - Independent capabilities (identity, payments)
2. **Core** - Framework-agnostic runtime
3. **Adapters** - Framework-specific integrations
4. **Tools** - Developer experience (CLI, templates)

This enables:

- **Modularity** - Use only what you need
- **Extensibility** - Easy to add new extensions and adapters
- **Clarity** - Clear package boundaries
- **Scalability** - Foundation for future growth
