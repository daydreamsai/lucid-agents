import type { AgentCard, Task } from '../a2a';
import type { AgentRuntime } from '../core';
import type { FetchFunction } from '../http';

export type XMPTContent = {
  text?: string;
  data?: unknown;
  mime?: string;
};

export type XMPTMessage = {
  id: string;
  threadId: string;
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

export type XMPTMessageDirection = 'inbound' | 'outbound';

export type XMPTMessageRecord = XMPTMessage & {
  direction: XMPTMessageDirection;
  peer?: string;
  taskId?: string;
};

export type XMPTListMessagesFilters = {
  threadId?: string;
  direction?: XMPTMessageDirection;
  limit?: number;
  offset?: number;
};

export type XMPTOnMessageHandler = (
  message: XMPTMessage
) => void | Promise<void>;

export type XMPTInboxReply = {
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  threadId?: string;
  to?: string;
};

export type XMPTInboxHandlerArgs = {
  message: XMPTMessage;
  runtime: AgentRuntime;
};

export type XMPTInboxHandler = (
  args: XMPTInboxHandlerArgs
) => XMPTInboxReply | void | Promise<XMPTInboxReply | void>;

export type XMPTStore = {
  append(message: XMPTMessageRecord): void | Promise<void>;
  list(
    filters?: XMPTListMessagesFilters
  ): XMPTMessageRecord[] | Promise<XMPTMessageRecord[]>;
};

export type XMPTSendOptions = {
  skillId?: string;
  timeoutMs?: number;
  fetch?: FetchFunction;
  metadata?: Record<string, unknown>;
};

export type XMPTSendInput = {
  id?: string;
  threadId?: string;
  from?: string;
  to?: string;
  content: XMPTContent;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export type XMPTSendAndWaitResult = {
  delivery: XMPTDeliveryResult;
  task: Task<XMPTMessage | null>;
};

export type XMPTRuntime = {
  send(
    peer: XMPTPeer,
    message: XMPTSendInput,
    options?: XMPTSendOptions
  ): Promise<XMPTDeliveryResult>;
  sendAndWait(
    peer: XMPTPeer,
    message: XMPTSendInput,
    options?: XMPTSendOptions
  ): Promise<XMPTSendAndWaitResult>;
  receive(message: XMPTMessage): Promise<XMPTMessage | undefined>;
  onMessage(handler: XMPTOnMessageHandler): () => void;
  listMessages(filters?: XMPTListMessagesFilters): Promise<XMPTMessageRecord[]>;
};
