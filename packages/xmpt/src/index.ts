/**
 * @lucid-agents/xmpt
 *
 * Agent-to-agent messaging extension for the Lucid SDK.
 *
 * @example
 * ```ts
 * import { createAgent } from '@lucid-agents/core';
 * import { http } from '@lucid-agents/http';
 * import { a2a } from '@lucid-agents/a2a';
 * import { xmpt } from '@lucid-agents/xmpt';
 *
 * const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
 *   .use(http())
 *   .use(a2a())
 *   .use(
 *     xmpt({
 *       inbox: {
 *         handler: async ({ message }) => ({
 *           content: { text: `ack:${message.content.text ?? ''}` },
 *         }),
 *       },
 *     })
 *   )
 *   .build();
 *
 * await runtime.xmpt.send(
 *   { url: 'http://localhost:8788' },
 *   { content: { text: 'hello' }, threadId: 't-1' }
 * );
 * ```
 */

export { xmpt, type XMPTExtensionOptions } from './extension';
export {
  createXMPTRuntime,
  DEFAULT_XMPT_INBOX_SKILL_ID,
  type CreateXMPTRuntimeOptions,
} from './runtime';
export { createMemoryXMPTStore } from './store/memory';
export { XMPTError, type XMPTErrorCode } from './errors';
