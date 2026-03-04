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

// ============================================================================
// Module-level shared mailbox for local transport (cross-instance messaging)
// ============================================================================
const localMailbox = new Map<string, Envelope[]>();
const localSubscribers = new Map<string, Set<(envelope: Envelope) => void | Promise<void>>>();

/**
 * Dispatch callbacks safely, handling async functions and catching errors
 */
function dispatchCallbacks(
  listeners: Array<(envelope: Envelope) => void | Promise<void>>,
  envelope: Envelope
): void {
  for (const cb of listeners) {
    void Promise.resolve(cb(envelope)).catch((error) => {
      console.error('[xmpt] onMessage callback failed:', error);
    });
  }
}

/**
 * Notify subscribers for a specific inbox
 */
function notifySubscribers(inbox: string, envelope: Envelope): void {
  const subs = localSubscribers.get(inbox);
  if (subs) {
    dispatchCallbacks(Array.from(subs), envelope);
  }
}

export function createXmptRuntime(
  runtime: AgentRuntime,
  options: XmptExtensionOptions
): XmptRuntimeImpl {
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
      return sendLocal(to, body, envelope);
    }

    try {
      const response = await fetch(`${agentMailConfig.baseUrl}/messages/send`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
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
      return sendLocal(to, body, envelope);
    }
  }

  // Local transport: publish to shared mailbox
  function sendLocal(
    to: string,
    body: string,
    envelope: Envelope
  ): Envelope {
    // Store in recipient's mailbox
    const targetMailbox = localMailbox.get(to) ?? [];
    targetMailbox.push(envelope);
    localMailbox.set(to, targetMailbox);
    
    // Notify subscribers for this inbox
    notifySubscribers(to, envelope);
    
    return envelope;
  }

  // Poll AgentMail for new messages
  async function pollAgentMail(): Promise<void> {
    if (!agentMailConfig.apiKey || transportMode !== 'agentmail') {
      return;
    }

    try {
      const response = await fetch(
        `${agentMailConfig.baseUrl}/messages/inbox?inbox=${encodeURIComponent(inbox)}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'Authorization': `Bearer ${agentMailConfig.apiKey}`,
          },
        }
      );

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
        const mailbox = localMailbox.get(inbox) ?? [];
        if (!mailbox.find(m => m.id === envelope.id)) {
          mailbox.push(envelope);
          localMailbox.set(inbox, mailbox);
          dispatchCallbacks(callbacks, envelope);
        }
      }
    } catch (error) {
      console.error('[xmpt] AgentMail poll failed:', error);
    }
  }

  return {
    async initialize(): Promise<void> {
      // Validate agentmail config at startup
      if (transportMode === 'agentmail' && !agentMailConfig.apiKey) {
        throw new Error(
          '[xmpt] AgentMail transport requires AGENTMAIL_API_KEY environment variable'
        );
      }
      
      // Initialize transport connection
      console.log(`[xmpt] Initialized with inbox: ${inbox}, transport: ${transportMode}`);
      
      // Register local subscriber for this inbox
      const subs = localSubscribers.get(inbox) ?? new Set();
      localSubscribers.set(inbox, subs);
      
      // Start polling for agentmail transport
      if (transportMode === 'agentmail') {
        setInterval(pollAgentMail, 30000);
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
        return sendViaAgentMail(to, body, envelope);
      } else {
        return sendLocal(to, body, envelope);
      }
    },

    onMessage(callback: (envelope: Envelope) => void | Promise<void>) {
      callbacks.push(callback);
      
      // Process any existing messages in mailbox
      const mailbox = localMailbox.get(inbox) ?? [];
      for (const msg of mailbox) {
        void Promise.resolve(callback(msg)).catch((error) => {
          console.error('[xmpt] onMessage replay callback failed:', error);
        });
      }
      
      // Register as subscriber
      const subs = localSubscribers.get(inbox) ?? new Set();
      subs.add(callback);
      localSubscribers.set(inbox, subs);
    },

    async reply(
      threadId: string,
      body: string,
      options?: { metadata?: Record<string, unknown> }
    ): Promise<Envelope> {
      const reply = ReplySchema.parse({ threadId, body, metadata: options?.metadata });
      
      // Find original message to get 'from' - search by id OR threadId
      // Search across all mailboxes
      let original: Envelope | undefined;
      for (const [, messages] of localMailbox) {
        original = messages.find(m => m.id === threadId || m.threadId === threadId);
        if (original) break;
      }
      
      // Throw descriptive error if original message not found
      if (!original) {
        throw new Error(
          `[xmpt] Cannot reply: thread "${reply.threadId}" not found for inbox "${inbox}"`
        );
      }

      return this.send(original.from, reply.body, {
        threadId: reply.threadId,
        metadata: reply.metadata,
      });
    },

    async getInbox(): Promise<Envelope[]> {
      // If using agentmail, poll for latest
      if (transportMode === 'agentmail') {
        await pollAgentMail();
      }
      return localMailbox.get(inbox) ?? [];
    },
  };
}
