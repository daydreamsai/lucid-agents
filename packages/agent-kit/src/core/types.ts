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
  /**
   * Open Graph image URL for social previews and x402scan discovery.
   * Should be an absolute URL (e.g., "https://agent.com/og-image.png").
   * Recommended size: 1200x630px.
   */
  image?: string;
  /**
   * Canonical URL of the agent. Used for Open Graph tags.
   * If not provided, defaults to the agent's origin URL.
   */
  url?: string;
  /**
   * Open Graph type. Defaults to "website".
   */
  type?: 'website' | 'article';
};

export type AgentContext = {
  key: string;
  input: unknown;
  signal: AbortSignal;
  headers: Headers;
  runId?: string;
};
