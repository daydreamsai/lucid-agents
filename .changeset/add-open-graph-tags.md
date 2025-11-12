---
"@lucid-agents/agent-kit": patch
---

# Add Open Graph Tags for Agent Discoverability

Implements GitHub issue [#37](https://github.com/daydreamsai/lucid-agents/issues/37).

## Summary

Agent landing pages now include Open Graph meta tags for better social sharing and x402scan discovery. This enables agents to show rich preview cards when shared on social platforms and improves discoverability in agent directories.

## Changes

### Enhanced AgentMeta Type

Added three optional fields to `AgentMeta` for Open Graph metadata:

```typescript
export type AgentMeta = {
  name: string;
  version: string;
  description?: string;
  icon?: string;

  // New: Open Graph metadata
  image?: string;  // Preview image URL (1200x630px recommended)
  url?: string;    // Canonical URL (defaults to origin if not provided)
  type?: 'website' | 'article';  // OG type (defaults to 'website')
};
```

### Landing Page Updates

The landing page renderer (`src/ui/landing-page.ts`) now automatically includes Open Graph meta tags in the HTML `<head>`:

```html
<meta property="og:title" content="${meta.name}" />
<meta property="og:description" content="${meta.description}" />
<meta property="og:image" content="${meta.image}" />
<meta property="og:url" content="${meta.url || origin}" />
<meta property="og:type" content="${meta.type || 'website'}" />
```

### Documentation Updates

Added comprehensive documentation in `AGENTS.md` explaining:
- How to use Open Graph fields
- What they enable (x402scan discovery, social sharing)
- Example usage
- Rendered HTML output

## Usage

```typescript
import { createAgentApp } from '@lucid-agents/agent-kit-hono';

const { app } = createAgentApp({
  name: 'My AI Agent',
  version: '1.0.0',
  description: 'AI-powered image processing',
  image: 'https://my-agent.com/og-image.png',
  url: 'https://my-agent.com',
  type: 'website',
});
```

**Result when shared on social platforms:**
```
┌─────────────────────────────────┐
│ [Image: og-image.png]           │
│ My AI Agent                     │
│ AI-powered image processing     │
│ my-agent.com                    │
└─────────────────────────────────┘
```

## Benefits

### 1. x402scan Discovery
Agent directories can crawl your agent's landing page and extract rich metadata for display in searchable catalogs.

### 2. Social Sharing
Links to your agent show professional preview cards on:
- Twitter/X
- Discord
- Slack
- LinkedIn
- Any platform that supports Open Graph

### 3. Professional Appearance
Makes your agent look polished and legitimate when shared or discovered.

## Backward Compatibility

**Fully backward compatible**
- All new fields are optional
- Existing agents work without changes
- Adapters automatically get new types through `AgentMeta` import

## Adapter Support

Both Hono and TanStack adapters automatically support Open Graph tags because they:
1. Import `AgentMeta` from `@lucid-agents/agent-kit`
2. Pass the meta object through to `createAgentHttpRuntime`
3. Use the landing page renderer which now includes OG tags

No adapter-specific changes needed - it "just works" through TypeScript type sharing.

## Example Updated

Updated `examples/agent-zero.ts` to demonstrate Open Graph usage:

```typescript
const { app } = createAgentApp({
  name: 'Agent Zero Arcade',
  version: '1.0.0',
  description: 'A playful quiz agent...',
  image: 'https://agent-zero-arcade.example.com/og-image.png',
  url: 'https://agent-zero-arcade.example.com',
  type: 'website',
});
```

## Notes

- **Headless agents**: Agents with `landingPage: false` don't render OG tags since they don't serve HTML
- **Default URL**: If `url` is not provided, it defaults to the agent's origin
- **Image recommendations**: 1200x630px is the standard size for social previews
- **All fields optional**: Agents can omit OG fields and still work perfectly

