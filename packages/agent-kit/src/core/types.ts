import type { Network } from 'x402/types';

export type { Network };

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AgentMeta = {
  name: string;
  version: string;
  description?: string;
  icon?: string;
};

export type AgentContext = {
  key: string;
  input: unknown;
  signal: AbortSignal;
  headers: Headers;
  runId?: string;
};
