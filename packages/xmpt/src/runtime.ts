import type { XmptRuntime, XmptExtensionOptions, Envelope, Reply } from './types';
import type { AgentRuntime } from '@lucid-agents/types/core';
import { EnvelopeSchema, ReplySchema } from './types';

export interface XmptRuntimeImpl extends XmptRuntime {
  initialize(): Promise<void>;
}

interface AgentMailConfig {
  baseUrl?: string;
  apiKey?: string;
}

export function createXmptRuntime(
  runtime: AgentRuntime,
  options: XmptExtensionOptions
): XmptRuntimeImpl {
  const messages: Envelope[] = [];
  const callbacks: ((envelope: Envelope) => void | Promise<void>)[] = [];
  const inbox = options.inbox || 'agent@agentmail.to';
  const transportMode = options.transport || 'local';
  
  // AgentMail configuration for real transport
  const agentMailConfig: AgentMailConfig = {
    baseUrl: process.env.AGENTMAIL_BASE_URL || 'https://api.agentmail.to',
    apiKey: process.env.AGENTMAIL_API_KEY,
  };
  
  // Generate unique IDs
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Send via AgentMail API (real transport)
  async function sendViaAgentMail(
    to: string,
    body: string,
    envelope: Envelope
  ): Promise<Envelope> {
    if (!agentMailConfig.apiKey) {
      // Fallback to local mode
      console.log('[xmpt] No AGENTMAIL_API_KEY, falling back to local mode');
      messages.push(envelope);
      return envelope;
    }

    try {
      const response = await fetch(`${agentMailConfig.baseUrl}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${agentMailConfig.apiKey}`,
        },
        body: JSON.stringify({
          to,
          from: inbox,
          subject: envelope.subject,
          body,
          threadId: envelope.threadId,
          metadata: envelope.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`AgentMail API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return { ...envelope, id: result.id || envelope.id };
    } catch (error) {
      console.error('[xmpt] AgentMail send failed, falling back to local:', error);
      // Fallback to local on error
      messages.push(envelope);
      return envelope;
    }
  }

  // Poll AgentMail for new messages
  async function pollAgentMail(): Promise<void> {
    if (!agentMailConfig.apiKey || transportMode !== 'agentmail') {
      return;
    }

    try {
      const response = await fetch(`${agentMailConfig.baseUrl}/messages/inbox?inbox=${encodeURIComponent(inbox)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${agentMailConfig.apiKey}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const newMessages: Envelope[] = Array.isArray(data) ? data : data.messages || [];
      
      for (const msg of newMessages) {
        const envelope = EnvelopeSchema.parse({
          id: msg.id || generateId(),
          from: msg.from,
          to: msg.to || inbox,
          threadId: msg.threadId,
          subject: msg.subject,
          body: msg.body,
          timestamp: msg.timestamp || Date.now(),
          metadata: msg.metadata,
        });
        
        // Avoid duplicates
        if (!messages.find(m => m.id === envelope.id)) {
          messages.push(envelope);
          callbacks.forEach(cb => cb(envelope));
        }
      }
    } catch (error) {
      console.error('[xmpt] AgentMail poll failed:', error);
    }
  }

  return {
    async initialize(): Promise<void> {
      // Initialize transport connection
      console.log(`[xmpt] Initialized with inbox: ${inbox}, transport: ${transportMode}`);
      
      // Start polling for agentmail transport
      if (transportMode === 'agentmail') {
        // Poll every 30 seconds
        setInterval(pollAgentMail, 30000);
        // Initial poll
        await pollAgentMail();
      }
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

      if (transportMode === 'agentmail') {
        // Use real AgentMail API
        return sendViaAgentMail(to, body, envelope);
      } else {
        // Local mode - just store locally
        messages.push(envelope);
        // Echo back for local testing, but only if it's TO our inbox
        if (envelope.to === inbox) {
          callbacks.forEach(cb => cb(envelope));
        }
        return envelope;
      }
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
      
      // Find original message to get 'from' - search by id OR threadId
      const original = messages.find(m => m.id === threadId || m.threadId === threadId);
      const to = original?.from || 'unknown';
      
      return this.send(to, body, { threadId, metadata: options?.metadata });
    },

    async getInbox(): Promise<Envelope[]> {
      // If using agentmail, poll for latest
      if (transportMode === 'agentmail') {
        await pollAgentMail();
      }
      return messages.filter(m => m.to === inbox);
    },
  };
}
