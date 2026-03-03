import type {
  XmptEnvelope,
  XmptMessageHandler,
  XmptTransport,
} from '@lucid-agents/types/xmpt';

export type LocalXmptNetwork = {
  deliver: (envelope: XmptEnvelope) => Promise<void>;
  subscribe: (inbox: string, handler: XmptMessageHandler) => () => void;
};

export function createLocalXmptNetwork(): LocalXmptNetwork {
  const subscribers = new Map<string, Set<XmptMessageHandler>>();

  return {
    async deliver(envelope) {
      const handlers = subscribers.get(envelope.to);
      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        await handler(envelope);
      }
    },
    subscribe(inbox, handler) {
      const handlers = subscribers.get(inbox) ?? new Set<XmptMessageHandler>();
      handlers.add(handler);
      subscribers.set(inbox, handlers);

      return () => {
        const current = subscribers.get(inbox);
        if (!current) {
          return;
        }
        current.delete(handler);
        if (current.size === 0) {
          subscribers.delete(inbox);
        }
      };
    },
  };
}

const defaultLocalXmptNetwork = createLocalXmptNetwork();

export function getDefaultLocalXmptNetwork(): LocalXmptNetwork {
  return defaultLocalXmptNetwork;
}

export function createLocalXmptTransport(
  network: LocalXmptNetwork = defaultLocalXmptNetwork
): XmptTransport {
  return {
    async send(envelope) {
      await network.deliver(envelope);
    },
    subscribe(inbox, handler) {
      return network.subscribe(inbox, handler);
    },
  };
}
