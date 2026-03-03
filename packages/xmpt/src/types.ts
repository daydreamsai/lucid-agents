import type { FetchFunction } from '@lucid-agents/types/http';

import type { LocalXmptNetwork } from './local-transport';

export type XmptAgentmailConfig = {
  transport: 'agentmail';
  inbox: string;
  baseUrl?: string;
  apiKey?: string;
  pollIntervalMs?: number;
  fetch?: FetchFunction;
};

export type XmptLocalConfig = {
  transport: 'local';
  inbox: string;
  network?: LocalXmptNetwork;
};

export type XmptConfig = XmptAgentmailConfig | XmptLocalConfig;
