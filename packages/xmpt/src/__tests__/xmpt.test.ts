import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createXmptRuntime } from '../runtime';
import type { AgentRuntime } from '@lucid-agents/types/core';

describe('XMPT Runtime', () => {
  let runtime: ReturnType<typeof createXmptRuntime>;
  const mockAgentRuntime = {
    agentId: 'test-agent',
  } as AgentRuntime;

  beforeEach(async () => {
    runtime = createXmptRuntime(mockAgentRuntime, {
      inbox: 'test@agentmail.to',
      transport: 'local',
    });
    await runtime.initialize();
  });

  describe('send()', () => {
    it('should send a message and return envelope', async () => {
      const envelope = await runtime.send('recipient@agentmail.to', 'Hello world');
      
      expect(envelope.id).toBeDefined();
      expect(envelope.from).toBe('test@agentmail.to');
      expect(envelope.to).toBe('recipient@agentmail.to');
      expect(envelope.body).toBe('Hello world');
      expect(envelope.timestamp).toBeDefined();
    });

    it('should accept optional subject', async () => {
      const envelope = await runtime.send('recipient@agentmail.to', 'Body', {
        subject: 'Test Subject',
      });
      
      expect(envelope.subject).toBe('Test Subject');
    });

    it('should accept optional threadId', async () => {
      const envelope = await runtime.send('recipient@agentmail.to', 'Reply', {
        threadId: 'thread-123',
      });
      
      expect(envelope.threadId).toBe('thread-123');
    });

    it('should accept optional metadata', async () => {
      const envelope = await runtime.send('recipient@agentmail.to', 'Body', {
        metadata: { priority: 'high', tags: ['urgent'] },
      });
      
      expect(envelope.metadata).toEqual({ priority: 'high', tags: ['urgent'] });
    });

    it('should generate unique IDs for each message', async () => {
      const envelope1 = await runtime.send('recipient@agentmail.to', 'Message 1');
      const envelope2 = await runtime.send('recipient@agentmail.to', 'Message 2');
      
      expect(envelope1.id).not.toBe(envelope2.id);
    });
  });

  describe('onMessage()', () => {
    it('should register callback and receive messages', async () => {
      const callback = vi.fn();
      runtime.onMessage(callback);
      
      await runtime.send('test@agentmail.to', 'Test message');
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Test message',
          to: 'test@agentmail.to',
        })
      );
    });

    it('should allow multiple callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      runtime.onMessage(callback1);
      runtime.onMessage(callback2);
      
      await runtime.send('test@agentmail.to', 'Test message');
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should not call callback for messages not addressed to this inbox', async () => {
      const callback = vi.fn();
      runtime.onMessage(callback);
      
      await runtime.send('other@agentmail.to', 'Not for me');
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reply()', () => {
    it('should reply to a thread', async () => {
      // First send a message
      const original = await runtime.send('other@agentmail.to', 'Original');
      
      // Then reply
      const reply = await runtime.reply(original.id, 'Reply to original');
      
      expect(reply.threadId).toBe(original.id);
      expect(reply.body).toBe('Reply to original');
    });

    it('should use original message sender as reply destination', async () => {
      // Simulate receiving a message first
      await runtime.send('test@agentmail.to', 'Received message');
      
      // Now find that message and reply
      const messages = await runtime.getInbox();
      const original = messages[0];
      
      const reply = await runtime.reply(original.id, 'Reply');
      
      // Reply goes to the person who sent the original message (from)
      expect(reply.to).toBe('test@agentmail.to');
    });

    it('should include metadata in reply', async () => {
      const original = await runtime.send('other@agentmail.to', 'Original');
      
      const reply = await runtime.reply(original.id, 'Reply', {
        metadata: { forwarded: true },
      });
      
      expect(reply.metadata).toEqual({ forwarded: true });
    });
  });

  describe('getInbox()', () => {
    it('should return messages sent to my inbox', async () => {
      await runtime.send('other@agentmail.to', 'Outgoing 1');
      await runtime.send('test@agentmail.to', 'Incoming 1');
      await runtime.send('test@agentmail.to', 'Incoming 2');
      
      const inbox = await runtime.getInbox();
      
      expect(inbox).toHaveLength(2);
      expect(inbox.map(m => m.body)).toContain('Incoming 1');
      expect(inbox.map(m => m.body)).toContain('Incoming 2');
    });

    it('should return empty array when no messages', async () => {
      const inbox = await runtime.getInbox();
      expect(inbox).toHaveLength(0);
    });

    it('should not return messages sent to other inboxes', async () => {
      await runtime.send('test@agentmail.to', 'For me');
      await runtime.send('other@agentmail.to', 'Not for me');
      
      const inbox = await runtime.getInbox();
      
      expect(inbox).toHaveLength(1);
      expect(inbox[0].body).toBe('For me');
    });
  });

  describe('transport modes', () => {
    it('should work with local transport (default)', async () => {
      const localRuntime = createXmptRuntime(mockAgentRuntime, {
        inbox: 'local@agentmail.to',
      });
      await localRuntime.initialize();
      
      const envelope = await localRuntime.send('recipient@agentmail.to', 'Test');
      expect(envelope.from).toBe('local@agentmail.to');
    });

    it('should fall back to local when agentmail transport used without API key', async () => {
      const agentmailRuntime = createXmptRuntime(mockAgentRuntime, {
        inbox: 'agentmail@agentmail.to',
        transport: 'agentmail',
      });
      await agentmailRuntime.initialize();
      
      // Should work because it falls back to local when no API key
      const envelope = await agentmailRuntime.send('recipient@agentmail.to', 'Test');
      expect(envelope).toBeDefined();
      expect(envelope.from).toBe('agentmail@agentmail.to');
    });
  });

  describe('envelope validation', () => {
    it('should validate envelope structure', async () => {
      const envelope = await runtime.send('test@test.com', 'Hello');
      
      expect(envelope).toHaveProperty('id');
      expect(envelope).toHaveProperty('from');
      expect(envelope).toHaveProperty('to');
      expect(envelope).toHaveProperty('body');
      expect(envelope).toHaveProperty('timestamp');
    });

    it('should allow all optional fields to be undefined', async () => {
      const envelope = await runtime.send('test@test.com', 'Simple');
      
      expect(envelope.threadId).toBeUndefined();
      expect(envelope.subject).toBeUndefined();
      expect(envelope.metadata).toBeUndefined();
    });
  });
});
