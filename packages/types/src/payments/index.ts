import type { Network, Resource } from 'x402/types';

/**
 * Solana address type (base58 encoded).
 */
export type SolanaAddress = string;

/**
 * Payment configuration for x402 protocol.
 * Supports both EVM (0x...) and Solana (base58) addresses.
 */
export type PaymentsConfig = {
  payTo: `0x${string}` | SolanaAddress;
  facilitatorUrl: Resource;
  network: Network;
};

/**
 * Price for an entrypoint - either a flat string or separate invoke/stream prices.
 */
export type EntrypointPrice = string | { invoke?: string; stream?: string };

/**
 * Payment requirement for an entrypoint.
 */
export type PaymentRequirement =
  | { required: false }
  | {
      required: true;
      payTo: string;
      price: string;
      network: Network;
      facilitatorUrl?: string;
    };

/**
 * HTTP-specific payment requirement that includes the Response object.
 */
export type RuntimePaymentRequirement =
  | { required: false }
  | (Extract<PaymentRequirement, { required: true }> & {
      response: Response;
    });

/**
 * Payments runtime type.
 * Returned by AgentRuntime.payments when payments are configured.
 */
export type PaymentsRuntime = {
  readonly config: PaymentsConfig;
  readonly isActive: boolean;
  requirements: (
    entrypoint: import('../core').EntrypointDef,
    kind: 'invoke' | 'stream'
  ) => RuntimePaymentRequirement;
  activate: (entrypoint: import('../core').EntrypointDef) => void;
};
