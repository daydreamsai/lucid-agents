import type { CircleGatewayChain, PaymentsConfig } from '@lucid-agents/types/payments';
import type { FacilitatorClient, FacilitatorConfig } from '@x402/core/server';
import type { Hex } from '../crypto';

export type GatewayWrappedFetch = typeof fetch & {
  preconnect?: () => Promise<void>;
};

export type GatewayFetchOptions = {
  privateKey: Hex;
  chain?: CircleGatewayChain | 'base-sepolia';
  fetchImpl?: typeof fetch;
  rpcUrl?: string;
};

export type GatewayDepositOptions = {
  privateKey: Hex;
  chain?: CircleGatewayChain | 'base-sepolia';
  rpcUrl?: string;
  approveAmount?: string;
  skipApprovalCheck?: boolean;
};

export type CircleGatewayConfig = {
  payments: PaymentsConfig;
  facilitator?: FacilitatorConfig;
};

export type CreateAuthHeaders = () => Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
  supported: Record<string, string>;
}>;

export type BatchRequirementsLike = {
  extra?: Record<string, unknown>;
};

export type CircleGatewayFacilitatorDeps = {
  BatchFacilitatorClient: new (config?: {
    url?: string;
    createAuthHeaders?: CreateAuthHeaders;
  }) => FacilitatorClient;
  GatewayEvmScheme: new () => unknown;
  isBatchPayment: (requirements: BatchRequirementsLike) => boolean;
  createStandardFacilitatorClient?: (
    config: FacilitatorConfig
  ) => FacilitatorClient;
};

export type CircleGatewayClientDeps = {
  BatchEvmScheme: new (signer: unknown) => {
    scheme: string;
    createPaymentPayload: (
      x402Version: number,
      paymentRequirements: {
        scheme: string;
        network: string;
        asset: string;
        amount: string;
        payTo: string;
        maxTimeoutSeconds: number;
        extra?: Record<string, unknown>;
      }
    ) => Promise<{ x402Version: number; payload: Record<string, unknown> }>;
  };
  GatewayClient: new (config: {
    chain: string;
    privateKey: Hex;
    rpcUrl?: string;
  }) => {
    getBalances: () => Promise<unknown>;
    deposit?: (
      amount: string,
      options?: { approveAmount?: string; skipApprovalCheck?: boolean }
    ) => Promise<unknown>;
  };
};
