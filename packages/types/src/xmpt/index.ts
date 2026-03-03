import { z } from 'zod';

/**
 * XMPT Message Envelope
 */
export const EnvelopeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  threadId: z.string().optional(),
  subject: z.string().optional(),
  body: z.string(),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

/**
 * XMPT Reply
 */
export const ReplySchema = z.object({
  threadId: z.string(),
  body: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Reply = z.infer<typeof ReplySchema>;

/**
 * XMPT Transport Types
 */
export const TransportConfigSchema = z.object({
  transport: z.enum(['agentmail', 'local']),
  inbox: z.string().optional(),
});

export type TransportConfig = z.infer<typeof TransportConfigSchema>;

/**
 * XMPT Runtime
 */
export interface XmptRuntime {
  send(to: string, body: string, options?: { subject?: string; threadId?: string; metadata?: Record<string, unknown> }): Promise<Envelope>;
  onMessage(callback: (envelope: Envelope) => void | Promise<void>): void;
  reply(threadId: string, body: string, options?: { metadata?: Record<string, unknown> }): Promise<Envelope>;
  getInbox(): Promise<Envelope[]>;
}

/**
 * XMPT Extension Options
 */
export interface XmptExtensionOptions {
  inbox?: string;
  transport?: 'agentmail' | 'local';
}
