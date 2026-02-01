import { z } from 'zod';

import type { AgentRuntime } from './runtime';

/**
 * Usage metrics for agent execution.
 */
export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/**
 * Context provided to entrypoint handlers.
 */
export type AgentContext = {
  key: string;
  input: unknown;
  signal: AbortSignal;
  metadata?: Record<string, unknown>;
  runId?: string;
  runtime?: AgentRuntime;
};

/**
 * Error thrown when input or output validation fails.
 */
export class ZodValidationError extends Error {
  constructor(
    public readonly kind: 'input' | 'output',
    public readonly issues: z.ZodError['issues']
  ) {
    super(
      kind === 'input' ? 'Invalid input provided' : 'Invalid output produced'
    );
  }
}
