import type { XmptRuntime, XmptExtensionOptions, Envelope, Reply } from './types';
import type { AgentRuntime } from '@lucid-agents/types/core';
import { EnvelopeSchema, ReplySchema } from './types';

export interface XmptRuntimeImpl extends XmptRuntime {
  initialize(): Promise<void>;
}

export function createXmptRuntime(
  runtime: AgentRuntime,
  options: XmptExtensionOptions
): XmptRuntimeImpl {
  const messages: Envelope[] = [];
  const callbacks: ((envelope: Envelope) => void | Promise<void>)[] = [];
  const inbox = options.inbox || 'agent@agentmail.to';
  const transportMode = options.transport || 'local';
  
  // Generate unique IDs
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    async initialize() {
      // Initialize transport connection
      console.log(`[xmpt] Initialized with inbox: ${inbox}, transport: ${options.transport || 'local'}`);
    },

    async send(
      to: string,
      body: string,
      options?: { subject?: string; threadId?: string; metadata?: Record<string, unknown> }
    ): Promise<Envelope> {
      const envelope: Envelope = {
        id: generateId(),
        from: inbox,
        to,
        threadId: options?.threadId,
        subject: options?.subject,
        body,
        timestamp: Date.now(),
        metadata: options?.metadata,
      };

      // Validate envelope
      EnvelopeSchema.parse(envelope);

      // In local mode, simulate sending by adding to local messages
      if (transportMode === 'local' || !transportMode) {
        messages.push(envelope);
        
        // For local transport, simulate receiving (echo)
        // In real agentmail transport, this would go to actual mail service
        callbacks.forEach(cb => cb(envelope));
      } else {
        // Agentmail transport - would make API call here
        // For now, just store locally
        messages.push(envelope);
      }

      return envelope;
    },

    onMessage(callback: (envelope: Envelope) => void | Promise<void>) {
      callbacks.push(callback);
      
      // Process any existing messages
      messages.forEach(msg => {
        if (msg.to === inbox) {
          callback(msg);
        }
      });
    },

    async reply(
      threadId: string,
      body: string,
      options?: { metadata?: Record<string, unknown> }
    ): Promise<Envelope> {
      const reply = ReplySchema.parse({ threadId, body, metadata: options?.metadata });
      
      // Find original message to get 'from'
      const original = messages.find(m => m.id === threadId || m.threadId === threadId);
      const to = original?.from || 'unknown';
      
      return this.send(to, body, { threadId, metadata: options?.metadata });
    },

    async getInbox(): Promise<Envelope[]> {
      return messages.filter(m => m.to === inbox);
    },
  };
}
