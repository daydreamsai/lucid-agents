# Agent Kit Examples

This directory contains example agent flows that you can use as a starting point for your own agents.

## Content Generation Agent

The `content-generation.ts` agent is a simple example of how to create an agent that generates content. It has a single entrypoint, `generate`, that takes a prompt and a content type as input.

To run this agent, you can use the following command:

```bash
bun run packages/agent-kit/examples/content-generation.ts
```

This will start a server on port 3000. You can then send a POST request to `http://localhost:3000/entrypoints/generate/invoke` with a JSON body like this:

```json
{
  "input": {
    "prompt": "how to start a business",
    "type": "blog"
  }
}
```

## Creating Your Own Agents

To create your own agent, you can copy one of the existing examples and modify it to suit your needs. Here are some ideas for agents you could create:

*   **Day Trading Agent:** An agent that analyzes market data and makes trades on your behalf.
*   **Social Media Agent:** An agent that manages your social media accounts, posting content and interacting with your followers.
*   **Drop Shipping Agent:** An agent that finds profitable products to drop ship and automates the ordering process.
*   **T-Shirt Designer Agent:** An agent that generates t-shirt designs and lists them for sale on a print-on-demand platform.
