import type { EntrypointDef } from '../core';

/**
 * MPP payment intent type.
 */
export type MppPaymentIntent = 'charge' | 'session';

/**
 * MPP payment method identifier.
 */
export type MppPaymentMethod = string;

/**
 * MPP payment requirement for an entrypoint.
 */
export type MppPaymentRequirement =
  | { required: false }
  | {
      required: true;
      amount: string;
      currency: string;
      intent: MppPaymentIntent;
      methods: MppPaymentMethod[];
      description?: string;
      response: Response;
    };

/**
 * Minimal MPP runtime interface exposed on AgentRuntime.mpp.
 *
 * The full implementation with getMppFetch, config, etc. lives in
 * @lucid-agents/mpp. This interface covers the subset needed by
 * framework adapters (hono, express) for payment enforcement.
 */
export type MppRuntime = {
  readonly isActive: boolean;
  requirements: (
    entrypoint: EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => MppPaymentRequirement;
  activate: (entrypoint: EntrypointDef) => void;
  resolvePrice: (
    entrypoint: EntrypointDef,
    which: 'invoke' | 'stream'
  ) => string | null;
};
