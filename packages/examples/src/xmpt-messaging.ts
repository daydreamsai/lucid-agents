/**
 * @example XMPT Messaging — Agent-to-Agent Communication
 *
 * This example demonstrates how two agents can exchange messages using the
 * @lucid-agents/xmpt extension.
 *
 * In a real deployment:
 * - Each agent runs on its own HTTP server
 * - The server routes POST /xmpt-inbox → runtime.xmpt.receive(message)
 * - Peers discover each other via Agent Cards
 *
 * This file shows the core API patterns.
 */

// import { createAgent } from '@lucid-agents/core';
import { createXMPTRuntime, createMemoryStore, xmpt } from '@lucid-agents/xmpt';

// ---------------------------------------------------------------------------
// Pattern 1: Low-level runtime usage (no framework)
// ---------------------------------------------------------------------------

async function lowLevelExample() {
  // Create an in-memory store
  const store = createMemoryStore();

  // Create a runtime for "beta" agent that echoes messages
  const betaRuntime = createXMPTRuntime({
    store,
    handler: async ({ message }) => {
      console.log('[beta] received:', message.content.text);
      return {
        content: { text: `echo: ${message.content.text}` },
      };
    },
  });

  // Register an additional handler dynamically
  const unsub = betaRuntime.onMessage(async ({ message }) => {
    console.log('[beta] audit log:', message.id);
  });

  // Simulate alpha sending a message to beta (in production, this goes over HTTP)
  const alphaRuntime = createXMPTRuntime({
    // In production, use the real global fetch
    fetchFn: async (url, init) => {
      // Simulate routing to beta's inbox handler
      const body = JSON.parse((init?.body as string) ?? '{}');
      const result = await betaRuntime.receive(body);
      return new Response(JSON.stringify(result ?? {}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  // Send a fire-and-forget message
  const delivery = await alphaRuntime.send(
    { url: 'http://beta.local' },
    { content: { text: 'hello beta!' }, threadId: 'thread-001' }
  );
  console.log('[alpha] delivery:', delivery.status, delivery.messageId);

  // Send and wait for a reply
  const reply = await alphaRuntime.sendAndWait(
    { url: 'http://beta.local' },
    { content: { text: 'ping' }, threadId: 'thread-001' },
    { timeoutMs: 5000 }
  );
  console.log('[alpha] reply:', reply?.content.text);

  // List messages in thread
  const thread = await betaRuntime.listMessages({ threadId: 'thread-001' });
  console.log('[beta] thread messages:', thread.length);

  // Cleanup dynamic handler
  unsub();
}

// ---------------------------------------------------------------------------
// Pattern 2: Extension-based usage with createAgent()
// ---------------------------------------------------------------------------

async function extensionExample() {
  /**
   * In a real app, you'd use createAgent from @lucid-agents/core:
   *
   * ```ts
   * import { createAgent } from '@lucid-agents/core';
   * import { xmpt } from '@lucid-agents/xmpt';
   *
   * const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
   *   .use(xmpt({
   *     inbox: {
   *       key: 'xmpt-inbox',    // optional: default is 'xmpt-inbox'
   *       handler: async ({ message }) => {
   *         return { content: { text: `ack: ${message.content.text}` } };
   *       },
   *     },
   *   }))
   *   .build();
   *
   * // The runtime now has an xmpt slice
   * await runtime.xmpt.send(
   *   { url: 'http://other-agent.example.com' },
   *   { content: { text: 'hello!' } }
   * );
   * ```
   *
   * The extension also registers an "XMPT Inbox" skill in the agent card,
   * making the agent discoverable to other XMPT-capable agents.
   */

  // Show the extension object shape
  const ext = xmpt({
    inbox: {
      handler: async ({ message }) => {
        return { content: { text: `ack: ${message.content.text}` } };
      },
    },
  });

  console.log('[ext] name:', ext.name);
  console.log('[ext] has build:', typeof ext.build === 'function');
  console.log('[ext] has onManifestBuild:', typeof ext.onManifestBuild === 'function');
}

// ---------------------------------------------------------------------------
// Run examples
// ---------------------------------------------------------------------------

await lowLevelExample();
await extensionExample();
