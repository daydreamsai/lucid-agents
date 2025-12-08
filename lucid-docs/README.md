# Lucid Agents Documentation

This is the official documentation site for the Lucid Agents SDK, built with [Fumadocs](https://fumadocs.dev) and [TanStack Start](https://tanstack.com/start).

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun dev
```

---

## Documentation Standards

This section outlines our documentation writing standards, best practices, and formatting guidelines to ensure consistency and quality across all documentation.

### Writing Principles

1. **Clarity over cleverness** - Write for developers of all experience levels. Avoid jargon unless it's industry-standard terminology that you define on first use.

2. **Action-oriented** - Lead with what the user can _do_, not abstract concepts. Start guides with the end result, then explain how to get there.

3. **Progressive disclosure** - Start simple, add complexity gradually. Introduce basic concepts before advanced ones.

4. **Show, don't tell** - Every concept should have a code example. Abstract explanations without examples are incomplete.

5. **Keep it current** - Documentation is only valuable if it matches the actual code. Update docs with every feature change.

### File Structure

All documentation lives in `content/docs/` as MDX files:

```
content/docs/
├── index.mdx                    # Landing page
├── meta.json                    # Navigation structure
├── getting-started/
│   ├── meta.json
│   ├── introduction.mdx
│   ├── installation.mdx
│   └── quickstart.mdx
├── core-concepts/
│   ├── meta.json
│   └── ...
└── api/
    ├── meta.json
    └── ...
```

### MDX Frontmatter

Every documentation page must include frontmatter:

```mdx
---
title: Page Title
description: A concise description (used in search and meta tags)
icon: IconName # Optional: Lucide icon name
---
```

### Formatting Guidelines

#### Headings

- Use sentence case for headings ("Getting started" not "Getting Started")
- Start with `##` (h2) within pages - h1 is reserved for the page title
- Keep heading hierarchy logical (don't skip from h2 to h4)

#### Code Blocks

Always specify the language and include a filename when relevant:

````mdx
```typescript title="agent.ts"
import { createAgent } from '@lucid-agents/core';

const agent = createAgent({
  name: 'my-agent',
  // ...
});
```
````

For shell commands, use `bash` and indicate what the command does:

````mdx
```bash
# Install dependencies
bun add @lucid-agents/core @lucid-agents/hono
```
````

#### Callouts

Use callouts for important information:

```mdx
<Callout type="info">Helpful supplementary information.</Callout>

<Callout type="warn">Important warnings the user should be aware of.</Callout>

<Callout type="error">
  Critical information about breaking changes or errors.
</Callout>
```

#### Links

- Use relative links for internal documentation: `[Installation](./installation)`
- Use descriptive link text: "See the [installation guide](./installation)" not "Click [here](./installation)"

#### Tables

Use tables for structured comparisons or reference data:

```mdx
| Package              | Purpose      |
| -------------------- | ------------ |
| `@lucid-agents/core` | Core runtime |
| `@lucid-agents/hono` | Hono adapter |
```

### Content Types

#### Conceptual Pages

Explain _what_ and _why_:

- Define the concept clearly
- Explain why it matters
- Show how it fits into the bigger picture
- Include a simple example

#### Tutorial Pages

Step-by-step guides:

- State prerequisites at the top
- Number steps clearly
- Include expected output/results
- End with next steps

#### Reference Pages (API)

Technical specifications:

- Function signatures with types
- Parameter descriptions
- Return value documentation
- Usage examples for each item

### Writing Checklist

Before submitting documentation:

- [ ] Frontmatter includes title and description
- [ ] All code examples are tested and work
- [ ] Links are valid and use relative paths
- [ ] Technical terms are defined on first use
- [ ] Examples use realistic, meaningful values (not "foo", "bar")
- [ ] Page answers: What is this? Why do I need it? How do I use it?

### Components Available

Fumadocs provides these components out of the box:

```mdx
import { Cards, Card } from 'fumadocs-ui/components/card';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Files, File, Folder } from 'fumadocs-ui/components/files';
import { TypeTable } from 'fumadocs-ui/components/type-table';

;
```

Use them to enhance readability and navigation.

---

## Documentation Rollout Plan

This plan outlines the documentation structure and prioritized pages for the Lucid Agents SDK.

### Phase 1: Foundation (Core Documentation)

Essential documentation for new users to get started.

#### 1.1 Getting Started

| Page              | File                                    | Priority | Description                                        |
| ----------------- | --------------------------------------- | -------- | -------------------------------------------------- |
| Introduction      | `getting-started/introduction.mdx`      | P0       | What is Lucid Agents? Value proposition, use cases |
| Installation      | `getting-started/installation.mdx`      | P0       | Package installation, requirements, CLI setup      |
| Quickstart        | `getting-started/quickstart.mdx`        | P0       | "Hello World" agent in 5 minutes                   |
| Project Structure | `getting-started/project-structure.mdx` | P1       | Anatomy of a Lucid agent project                   |

#### 1.2 Core Concepts

| Page        | File                       | Priority | Description                                  |
| ----------- | -------------------------- | -------- | -------------------------------------------- |
| Agents      | `concepts/agents.mdx`      | P0       | What is an agent? AgentMeta, lifecycle       |
| Entrypoints | `concepts/entrypoints.mdx` | P0       | Defining capabilities with schemas           |
| Runtime     | `concepts/runtime.mdx`     | P1       | How the runtime executes requests            |
| Extensions  | `concepts/extensions.mdx`  | P1       | Extension architecture, building extensions  |
| Adapters    | `concepts/adapters.mdx`    | P1       | Framework adapters (Hono, TanStack, Express) |

### Phase 2: Features (Extension Documentation)

Documentation for optional SDK capabilities.

#### 2.1 Payments (x402)

| Page                | File                           | Priority | Description                         |
| ------------------- | ------------------------------ | -------- | ----------------------------------- |
| Overview            | `payments/index.mdx`           | P0       | What is x402? Payment flow overview |
| Configuration       | `payments/configuration.mdx`   | P1       | Setting up payment providers        |
| Pricing Entrypoints | `payments/pricing.mdx`         | P1       | Adding prices to entrypoints        |
| Receiving Payments  | `payments/receiving.mdx`       | P1       | Server-side payment verification    |
| Making Payments     | `payments/making-payments.mdx` | P2       | Client-side payment with x402-fetch |

#### 2.2 Identity (ERC-8004)

| Page          | File                         | Priority | Description                 |
| ------------- | ---------------------------- | -------- | --------------------------- |
| Overview      | `identity/index.mdx`         | P1       | On-chain identity and trust |
| Registration  | `identity/registration.mdx`  | P2       | Registering agent identity  |
| Domain Proofs | `identity/domain-proofs.mdx` | P2       | Proving domain ownership    |
| Reputation    | `identity/reputation.mdx`    | P2       | Reputation registry usage   |

#### 2.3 Agent-to-Agent (A2A)

| Page          | File                    | Priority | Description                       |
| ------------- | ----------------------- | -------- | --------------------------------- |
| Overview      | `a2a/index.mdx`         | P1       | A2A protocol introduction         |
| Agent Cards   | `a2a/agent-cards.mdx`   | P1       | Building and fetching Agent Cards |
| Tasks         | `a2a/tasks.mdx`         | P2       | Task-based operations             |
| Conversations | `a2a/conversations.mdx` | P2       | Multi-turn conversations          |

#### 2.4 AP2 (Agent Payments Protocol)

| Page          | File               | Priority | Description                      |
| ------------- | ------------------ | -------- | -------------------------------- |
| Overview      | `ap2/index.mdx`    | P2       | AP2 extension for agent commerce |
| Merchant Role | `ap2/merchant.mdx` | P2       | Selling services as an agent     |
| Shopper Role  | `ap2/shopper.mdx`  | P2       | Consuming paid agent services    |

### Phase 3: Guides (Practical Tutorials)

Step-by-step tutorials for common use cases.

| Page                         | File                             | Priority | Description                                 |
| ---------------------------- | -------------------------------- | -------- | ------------------------------------------- |
| Build an LLM Agent           | `guides/llm-agent.mdx`           | P0       | Using AxLLM for AI-powered agents           |
| Add Payments to Agent        | `guides/add-payments.mdx`        | P1       | Monetize your agent with x402               |
| Agent Authentication         | `guides/authentication.mdx`      | P1       | Securing agent endpoints                    |
| Deploy to Production         | `guides/deployment.mdx`          | P1       | Deploying agents (Cloudflare, Vercel, etc.) |
| Agent-to-Agent Communication | `guides/agent-communication.mdx` | P2       | Building agents that talk to each other     |
| Build a Trading Agent        | `guides/trading-agent.mdx`       | P2       | Complete example: merchant + shopper        |

### Phase 4: API Reference

Auto-generated and manually enhanced API documentation.

#### 4.1 Packages

| Page                   | File               | Priority | Description                |
| ---------------------- | ------------------ | -------- | -------------------------- |
| @lucid-agents/types    | `api/types.mdx`    | P1       | Type definitions reference |
| @lucid-agents/core     | `api/core.mdx`     | P0       | Core runtime API           |
| @lucid-agents/hono     | `api/hono.mdx`     | P1       | Hono adapter API           |
| @lucid-agents/tanstack | `api/tanstack.mdx` | P1       | TanStack adapter API       |
| @lucid-agents/express  | `api/express.mdx`  | P2       | Express adapter API        |
| @lucid-agents/payments | `api/payments.mdx` | P1       | Payments extension API     |
| @lucid-agents/identity | `api/identity.mdx` | P2       | Identity extension API     |
| @lucid-agents/a2a      | `api/a2a.mdx`      | P2       | A2A extension API          |
| @lucid-agents/ap2      | `api/ap2.mdx`      | P2       | AP2 extension API          |
| @lucid-agents/cli      | `api/cli.mdx`      | P1       | CLI commands reference     |

### Phase 5: Advanced Topics

Deep dives and architecture documentation.

| Page                | File                               | Priority | Description                 |
| ------------------- | ---------------------------------- | -------- | --------------------------- |
| Architecture        | `advanced/architecture.mdx`        | P2       | SDK architecture deep dive  |
| Building Extensions | `advanced/building-extensions.mdx` | P2       | Create custom extensions    |
| Building Adapters   | `advanced/building-adapters.mdx`   | P3       | Create framework adapters   |
| Performance         | `advanced/performance.mdx`         | P3       | Optimization strategies     |
| Troubleshooting     | `advanced/troubleshooting.mdx`     | P2       | Common issues and solutions |

### Recommended Navigation Structure

```json
// content/docs/meta.json
{
  "pages": ["index", "---Getting Started---", "getting-started/[...]"],
  "getting-started": {
    "title": "Getting Started",
    "pages": ["introduction", "installation", "quickstart", "project-structure"]
  },
  "concepts": {
    "title": "Core Concepts",
    "pages": ["agents", "entrypoints", "runtime", "extensions", "adapters"]
  },
  "guides": {
    "title": "Guides",
    "pages": [
      "llm-agent",
      "add-payments",
      "authentication",
      "deployment",
      "agent-communication",
      "trading-agent"
    ]
  },
  "payments": {
    "title": "Payments",
    "pages": [
      "index",
      "configuration",
      "pricing",
      "receiving",
      "making-payments"
    ]
  },
  "identity": {
    "title": "Identity",
    "pages": ["index", "registration", "domain-proofs", "reputation"]
  },
  "a2a": {
    "title": "Agent-to-Agent",
    "pages": ["index", "agent-cards", "tasks", "conversations"]
  },
  "ap2": {
    "title": "AP2",
    "pages": ["index", "merchant", "shopper"]
  },
  "api": {
    "title": "API Reference",
    "pages": [
      "core",
      "types",
      "hono",
      "tanstack",
      "express",
      "payments",
      "identity",
      "a2a",
      "ap2",
      "cli"
    ]
  },
  "advanced": {
    "title": "Advanced",
    "pages": [
      "architecture",
      "building-extensions",
      "building-adapters",
      "performance",
      "troubleshooting"
    ]
  }
}
```

### Priority Definitions

| Priority | Meaning                              | Timeline |
| -------- | ------------------------------------ | -------- |
| **P0**   | Critical - Required for launch       | Week 1   |
| **P1**   | High - Needed for full functionality | Week 2-3 |
| **P2**   | Medium - Enhances completeness       | Week 4-6 |
| **P3**   | Low - Nice to have                   | Ongoing  |

### Minimum Viable Documentation (MVP)

For initial launch, complete all P0 pages:

1. `getting-started/introduction.mdx`
2. `getting-started/installation.mdx`
3. `getting-started/quickstart.mdx`
4. `concepts/agents.mdx`
5. `concepts/entrypoints.mdx`
6. `payments/index.mdx`
7. `guides/llm-agent.mdx`
8. `api/core.mdx`

This gives users enough to:

- Understand what Lucid Agents is
- Install and set up a project
- Build their first agent
- Understand core concepts
- Reference the main API

---

## Contributing to Documentation

1. Create a new branch for your documentation changes
2. Add or edit MDX files in `content/docs/`
3. Update `meta.json` files if adding new pages
4. Run `bun dev` and verify your changes render correctly
5. Submit a PR with a clear description of what was added/changed

## Building for Production

```bash
bun build
```

This generates a static site in the `dist/` directory.
