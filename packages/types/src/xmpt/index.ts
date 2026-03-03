export type XmptEnvelope<TPayload = unknown> = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  transport: string;
  createdAt: string;
  replyTo?: string;
  payload: TPayload;
};

export type XmptSendInput<TPayload = unknown> = {
  to: string;
  payload: TPayload;
  threadId?: string;
  replyTo?: string;
};

export type XmptMessageHandler<TPayload = unknown> = (
  envelope: XmptEnvelope<TPayload>
) => void | Promise<void>;

export type XmptTransport = {
  send: (envelope: XmptEnvelope) => Promise<void>;
  subscribe: (
    inbox: string,
    handler: XmptMessageHandler
  ) => (() => void) | Promise<() => void>;
};

export type XmptRuntime = {
  readonly inbox: string;
  readonly transport: string;
  send: <TPayload = unknown>(
    input: XmptSendInput<TPayload>
  ) => Promise<XmptEnvelope<TPayload>>;
  onMessage: <TPayload = unknown>(
    handler: XmptMessageHandler<TPayload>
  ) => () => void;
  reply: <TPayload = unknown>(
    threadId: string,
    payload: TPayload
  ) => Promise<XmptEnvelope<TPayload>>;
};
