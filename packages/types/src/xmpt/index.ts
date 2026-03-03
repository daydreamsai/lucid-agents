import type { AgentCard } from '../a2a';

export type XMPTContent = {
  text?: string;
  data?: unknown;
  mime?: string;
};

export type XMPTMessage = {
  id: string;
  threadId?: string;
  from?: string;
  to?: string;
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type XMPTPeer = { url: string } | { card: AgentCard };

export type XMPTDeliveryResult = {
  taskId: string;
  status: string;
  messageId: string;
};

export type XMPTInboxHandler = (ctx: {
  message: XMPTMessage;
}) => Promise<{ content: XMPTContent } | void>;

export type XMPTStore = {
  save(message: XMPTMessage): Promise<void>;
  list(filter?: { threadId?: string }): Promise<XMPTMessage[]>;
};

export type XMPTRuntime = {
  send(
    peer: XMPTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'>,
    options?: { timeoutMs?: number }
  ): Promise<XMPTDeliveryResult>;
  sendAndWait(
    peer: XMPTPeer,
    message: Omit<XMPTMessage, 'id' | 'createdAt'>,
    options?: { timeoutMs?: number }
  ): Promise<XMPTMessage | null>;
  receive(message: XMPTMessage): Promise<{ content: XMPTContent } | void>;
  onMessage(handler: XMPTInboxHandler): () => void;
  listMessages(filter?: { threadId?: string }): Promise<XMPTMessage[]>;
};
