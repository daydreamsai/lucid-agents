import type { FetchFunction } from '@lucid-agents/types/http';
import type {
  XmptEnvelope,
  XmptMessageHandler,
  XmptTransport,
} from '@lucid-agents/types/xmpt';

import { agentmailPollResponseSchema, xmptEnvelopeSchema } from './schema';

const DEFAULT_AGENTMAIL_BASE_URL = 'https://api.agentmail.to/v1';
const DEFAULT_AGENTMAIL_POLL_INTERVAL_MS = 1_000;

type AgentmailTransportOptions = {
  inbox: string;
  baseUrl?: string;
  apiKey?: string;
  pollIntervalMs?: number;
  fetch?: FetchFunction;
};

function createHeaders(apiKey?: string): Headers {
  const headers = new Headers({
    'content-type': 'application/json',
  });

  if (apiKey) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }

  return headers;
}

function resolveFetch(fetchImpl?: FetchFunction): FetchFunction {
  const fallback = globalThis.fetch;
  if (fetchImpl) {
    return fetchImpl;
  }
  if (!fallback) {
    throw new Error('XMPT agentmail transport requires a fetch implementation');
  }
  return fallback;
}

export function createAgentmailTransport(
  options: AgentmailTransportOptions
): XmptTransport {
  const fetchImpl = resolveFetch(options.fetch);
  const baseUrl = options.baseUrl ?? DEFAULT_AGENTMAIL_BASE_URL;
  const pollIntervalMs =
    options.pollIntervalMs ?? DEFAULT_AGENTMAIL_POLL_INTERVAL_MS;

  return {
    async send(envelope: XmptEnvelope) {
      const parsed = xmptEnvelopeSchema.parse(envelope);
      const response = await fetchImpl(`${baseUrl}/messages`, {
        method: 'POST',
        headers: createHeaders(options.apiKey),
        body: JSON.stringify(parsed),
      });

      if (!response.ok) {
        throw new Error(
          `XMPT agentmail send failed: ${response.status} ${response.statusText}`
        );
      }
    },
    subscribe(inbox: string, handler: XmptMessageHandler) {
      let cursor: string | undefined;
      let active = true;
      let polling = false;

      const poll = async () => {
        if (!active || polling) {
          return;
        }

        polling = true;
        try {
          const url = new URL(`${baseUrl}/messages`);
          url.searchParams.set('inbox', inbox || options.inbox);
          if (cursor) {
            url.searchParams.set('after', cursor);
          }

          const response = await fetchImpl(url.toString(), {
            method: 'GET',
            headers: createHeaders(options.apiKey),
          });
          if (!response.ok) {
            return;
          }

          const json = await response.json();
          const parsed = agentmailPollResponseSchema.parse(json);

          const messages = Array.isArray(parsed) ? parsed : parsed.messages;
          const nextCursor = Array.isArray(parsed)
            ? undefined
            : parsed.nextCursor;

          for (const message of messages) {
            await handler(message);
          }

          if (nextCursor) {
            cursor = nextCursor;
          } else if (messages.length > 0) {
            cursor = messages[messages.length - 1]?.id;
          }
        } finally {
          polling = false;
        }
      };

      void poll();
      const interval = setInterval(() => {
        void poll();
      }, pollIntervalMs);

      return () => {
        active = false;
        clearInterval(interval);
      };
    },
  };
}
