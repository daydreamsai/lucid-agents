# Lucid Agents - SDK Architecture

High-level architecture overview of the Lucid Agents SDK.

## Package Structure

The SDK is organized into four architectural layers:

```mermaid
graph TB
    subgraph "Layer 0: Types"
        types["@lucid-agents/types<br/>Shared type definitions"]
    end

    subgraph "Layer 1: Extensions"
        identity["@lucid-agents/identity<br/>ERC-8004 identity & trust"]
        payments["@lucid-agents/payments<br/>x402 bi-directional payments"]
        wallet["@lucid-agents/wallet<br/>Wallet connectors"]
        a2a["@lucid-agents/a2a<br/>A2A protocol support"]
        ap2["@lucid-agents/ap2<br/>AP2 extension"]
        future["Future extensions<br/>(monitoring, etc.)"]
    end

    subgraph "Layer 2: Core"
        core["@lucid-agents/core<br/>Core runtime"]
    end

    subgraph "Layer 3: Adapters"
        hono["@lucid-agents/hono<br/>Hono framework adapter"]
        tanstack["@lucid-agents/tanstack<br/>TanStack Start adapter"]
        express["Future: Express adapter"]
    end

    subgraph "Layer 4: Developer Tools"
        cli["@lucid-agents/cli<br/>CLI scaffolding tool"]
        templates["Templates<br/>(blank, axllm, identity, etc.)"]
    end

    types --> identity
    types --> payments
    types --> wallet
    types --> a2a
    types --> ap2
    types --> core

    core --> identity
    core --> payments
    core --> wallet
    core --> a2a
    core --> ap2

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
    subgraph "Types Foundation"
        types[types]
    end

    subgraph "Extensions (Independent)"
        identity[identity]
        payments[payments]
        wallet[wallet]
        a2a[a2a]
        ap2[ap2]
    end

    subgraph "Core Runtime"
        core[core]
    end

    subgraph "Framework Adapters"
        hono[hono]
        tanstack[tanstack]
    end

    subgraph "Developer Tools"
        cli[cli]
    end

    types --> identity
    types --> payments
    types --> wallet
    types --> a2a
    types --> ap2
    types --> core

    payments --> core
    identity --> core
    wallet --> core
    a2a --> core
    ap2 --> core

    core --> hono
    core --> tanstack

    hono --> cli
    tanstack --> cli

    style types fill:#4fc3f7
    style identity fill:#81c784
    style payments fill:#81c784
    style wallet fill:#81c784
    style a2a fill:#81c784
    style ap2 fill:#81c784
    style core fill:#ffb74d
    style hono fill:#ba68c8
    style tanstack fill:#ba68c8
    style cli fill:#e57373
```

Note: Dependencies are one-directional. @lucid-agents/core imports from extensions (both types and runtime functions). All packages import shared types from @lucid-agents/types. This pure DAG structure eliminates circular dependencies.

## Layer 1: Extensions

Extensions add optional capabilities. They are independent and don't depend on each other.

### @lucid-agents/identity

**Purpose:** ERC-8004 on-chain identity and trust layer

**Provides:**

- Registry clients (Identity, Reputation, Validation)
- Trust configuration
- Domain proof signing
- `createAgentIdentity()` bootstrap function

**Dependencies:** `viem` (Ethereum interactions)

---

### @lucid-agents/payments

**Purpose:** x402 payment protocol (bi-directional)

**Provides:**

- Entrypoint definitions (priced capabilities)
- Payment requirement resolution (server-side)
- x402 client utilities (client-side)
- Payment configuration and validation
- Multi-network support (EVM and Solana)

**Dependencies:** `x402`, `x402-fetch`, `zod`

---

### @lucid-agents/wallet

**Purpose:** Wallet connectors and helpers for agent operations

**Provides:**

- Wallet client creation and management
- Multi-network wallet support (EVM and Solana)
- Wallet configuration utilities

**Dependencies:** `viem` (Ethereum interactions)

---

### @lucid-agents/a2a

**Purpose:** Agent-to-Agent (A2A) protocol implementation

**Provides:**

- Agent Card building and fetching
- A2A client utilities (invoke, stream, task operations)
- Task-based operations (sendMessage, getTask, listTasks, cancelTask)
- Multi-turn conversation support with contextId
- A2A runtime integration

**Dependencies:** `@lucid-agents/types`, `zod`

---

### @lucid-agents/ap2

**Purpose:** AP2 (Agent Payments Protocol) extension

**Provides:**

- AP2 runtime creation
- Agent Card enhancement with AP2 extension metadata
- AP2 role management (merchant, shopper)

**Dependencies:** `@lucid-agents/types`

## Layer 2: Core

### @lucid-agents/core

**Purpose:** Framework-agnostic agent runtime

**Provides:**

- Agent execution (`AgentCore`)
- HTTP request handlers (invoke, stream, tasks)
- Server-Sent Events (SSE) streaming
- Manifest generation (AgentCard, A2A)
- Task management (create, get, list, cancel, subscribe)
- Configuration management
- Landing page UI

**Dependencies:** `@lucid-agents/payments`, `@lucid-agents/identity`, `@lucid-agents/wallet`, `@lucid-agents/a2a`, `@lucid-agents/ap2`

## Layer 3: Adapters

Adapters integrate the core runtime with specific web frameworks.

### @lucid-agents/hono

**Purpose:** Hono framework integration

**Provides:**

- `createAgentApp()` - Returns Hono app instance
- `withPayments()` - x402-hono middleware wrapper
- Automatic route registration for tasks, entrypoints, manifest

**Dependencies:** `@lucid-agents/core`, `hono`, `x402-hono`

---

### @lucid-agents/tanstack

**Purpose:** TanStack Start framework integration

**Provides:**

- `createTanStackRuntime()` - Returns runtime & handlers
- `withPayments()` - x402-tanstack middleware wrapper
- Route files for tasks, entrypoints, manifest

**Dependencies:** `@lucid-agents/core`, `@tanstack/start`, `x402-tanstack-start`

---

### @lucid-agents/express

**Purpose:** Express framework integration

**Provides:**

- `createAgentApp()` - Returns Express app instance
- `withPayments()` - x402 Express middleware wrapper
- Automatic route registration for tasks, entrypoints, manifest

**Dependencies:** `@lucid-agents/core`, `express`, `x402-express`

## Layer 4: Developer Tools

### @lucid-agents/cli

**Purpose:** CLI for scaffolding new agent projects

**Provides:**

- Interactive project wizard
- Template system (blank, axllm, identity, axllm-flow, trading-\*)
- Adapter selection (hono, tanstack-ui, tanstack-headless, express)
- Merge system (combines adapter + template)

**Dependencies:** All @lucid-agents packages

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
    A[1. types] --> B[2. identity]
    A --> C[2. payments]
    A --> D[2. wallet]
    A --> E[2. a2a]
    A --> F[2. ap2]
    B --> G[3. core]
    C --> G
    D --> G
    E --> G
    F --> G
    G --> H[4. hono]
    G --> I[4. tanstack]
    G --> J[4. express]
    H --> K[5. cli]
    I --> K
    J --> K

    style A fill:#4fc3f7
    style B fill:#90caf9
    style C fill:#a5d6a7
    style D fill:#a5d6a7
    style E fill:#a5d6a7
    style F fill:#a5d6a7
    style G fill:#ffb74d
    style H fill:#ba68c8
    style I fill:#ba68c8
    style J fill:#ba68c8
    style K fill:#e57373
```

Note: All extension packages (identity, payments, wallet, a2a, ap2) are independent and can build in parallel. Core depends on all extensions, and adapters depend on core.

## Package Responsibilities

| Package                  | Responsibility                                               |
| ------------------------ | ------------------------------------------------------------ |
| `@lucid-agents/types`    | Shared type definitions (zero dependencies)                  |
| `@lucid-agents/identity` | ERC-8004 on-chain identity, registries, trust models         |
| `@lucid-agents/payments` | x402 protocol, EntrypointDef, pricing, payment client/server |
| `@lucid-agents/wallet`   | Wallet connectors and helpers for agent operations           |
| `@lucid-agents/a2a`      | A2A protocol implementation, Agent Cards, task operations    |
| `@lucid-agents/ap2`      | AP2 extension for Agent Cards                                |
| `@lucid-agents/core`     | Core runtime, HTTP handlers, SSE, manifest, config, UI       |
| `@lucid-agents/hono`     | Hono framework integration, middleware wiring                |
| `@lucid-agents/tanstack` | TanStack framework integration, middleware wiring            |
| `@lucid-agents/express`  | Express framework integration, middleware wiring             |
| `@lucid-agents/cli`      | CLI tool, templates, project scaffolding                     |

## Extension Independence

```mermaid
graph TB
    subgraph "Independent Extensions"
        identity[@lucid-agents/identity<br/>ERC-8004 identity]
        payments[@lucid-agents/payments<br/>x402 payments]
        wallet[@lucid-agents/wallet<br/>Wallet connectors]
        a2a[@lucid-agents/a2a<br/>A2A protocol]
        ap2[@lucid-agents/ap2<br/>AP2 extension]
    end

    subgraph "Core"
        core[@lucid-agents/core<br/>Uses all extensions]
    end

    identity -.->|optional| core
    payments -.->|optional| core
    wallet -.->|optional| core
    a2a -.->|optional| core
    ap2 -.->|optional| core

    style identity fill:#90caf9
    style payments fill:#a5d6a7
    style wallet fill:#a5d6a7
    style a2a fill:#a5d6a7
    style ap2 fill:#a5d6a7
    style core fill:#ffcc80
```

Extensions are independent modules that core can optionally use. They don't depend on each other.

## Types Package

`@lucid-agents/types` is the foundational package containing all shared type definitions.

### Key Characteristics

- **Zero dependencies** on other @lucid-agents packages
- **Only external dependencies**: zod, x402
- **Pure TypeScript types** - no runtime code
- **Single source of truth** for type contracts

### Contains

- `AgentMeta`, `AgentContext`, `Usage` - Core agent types
- `EntrypointDef`, `EntrypointPrice`, `EntrypointHandler` - Entrypoint types
- `PaymentsConfig`, `SolanaAddress` - Payment types
- Stream types for SSE responses

### Architecture Benefits

All packages import from @lucid-agents/types, creating a clean dependency DAG:

```mermaid
graph TD
    types[@lucid-agents/types]
    identity[@lucid-agents/identity]
    payments[@lucid-agents/payments]
    core[@lucid-agents/core]
    hono[@lucid-agents/hono]
    tanstack[@lucid-agents/tanstack]
    cli[@lucid-agents/cli]

    types --> identity
    types --> payments
    types --> core
    identity --> core
    payments --> core
    core --> hono
    core --> tanstack
    hono --> cli
    tanstack --> cli
```

**Benefits:**

- Zero circular dependencies (pure DAG)
- Explicit type contracts
- Better IDE support and type inference
- Smaller bundles (types erased at compile time)
- Easy to maintain and evolve

## Future Roadmap

Planned extensions and adapters:

```mermaid
graph TB
    subgraph "Existing"
        identity_now[@lucid-agents/identity]
        payments_now[@lucid-agents/payments]
        wallet_now[@lucid-agents/wallet]
        a2a_now[@lucid-agents/a2a]
        ap2_now[@lucid-agents/ap2]
        core_now[@lucid-agents/core]
        hono_now[@lucid-agents/hono]
        tanstack_now[@lucid-agents/tanstack]
        express_now[@lucid-agents/express]
    end

    subgraph "Planned Extensions"
        monitoring[monitoring<br/>Metrics & observability]
        storage[storage<br/>Persistent state]
    end

    subgraph "Planned Adapters"
        fastify[fastify]
        nextjs[nextjs]
    end

    core_now --> monitoring
    core_now --> storage

    core_now --> fastify
    core_now --> nextjs

    style monitoring fill:#fff59d,stroke-dasharray: 5 5
    style storage fill:#fff59d,stroke-dasharray: 5 5
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
