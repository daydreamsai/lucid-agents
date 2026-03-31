export type XmptHeaders = Record<string, string>;

export interface XmptEnvelope<TPayload = unknown> {
  id: string;
  threadId: string;
  from: string;
  to: string;
  timestamp: string;
  payload: TPayload;
  headers?: XmptHeaders;
  replyTo?: string;
}

export interface XmptSendOptions {
  threadId?: string;
  headers?: XmptHeaders;
  replyTo?: string;
}

export interface XmptReplyOptions {
  to?: string;
  headers?: XmptHeaders;
  replyTo?: string;
}

export type XmptMessageHandler<TPayload = unknown> = (
  envelope: XmptEnvelope<TPayload>
) => void | Promise<void>;

export interface XmptTransport {
  send<TPayload = unknown>(envelope: XmptEnvelope<TPayload>): Promise<void>;
  subscribe(
    inbox: string,
    handler: XmptMessageHandler
  ): Promise<() => void> | (() => void);
  shutdown?(): Promise<void> | void;
}

export interface XmptClient<TInbound = unknown> {
  inbox: string;
  send<TOutbound = unknown>(
    to: string,
    payload: TOutbound,
    options?: XmptSendOptions
  ): Promise<XmptEnvelope<TOutbound>>;
  reply<TOutbound = unknown>(
    threadId: string,
    payload: TOutbound,
    options?: XmptReplyOptions
  ): Promise<XmptEnvelope<TOutbound>>;
  onMessage(handler: XmptMessageHandler<TInbound>): () => void;
  close(): Promise<void>;
}

export interface LocalTransportOptions {
  namespace?: string;
}

export interface AgentmailTransportOptions {
  baseUrl?: string;
  apiKey?: string;
  pollIntervalMs?: number;
  fetch?: typeof fetch;
}

export type XmptConfig =
  | {
      transport: "local";
      inbox: string;
      local?: LocalTransportOptions;
    }
  | {
      transport: "agentmail";
      inbox: string;
      agentmail?: AgentmailTransportOptions;
    }
  | {
      transport: XmptTransport;
      inbox: string;
    };