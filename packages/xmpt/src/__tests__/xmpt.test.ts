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
        metadata: { priority: 'high' },
      });
      
      expect(envelope.metadata).toEqual({ priority: 'high' });
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
  });
});
