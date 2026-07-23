import type { Network, PaymentPayload } from '@x402/core/types';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  AuthorizerSigner,
  BatchSettlementChannelManager,
  BatchSettlementEvmScheme,
  BatchSettlementEvmSchemeServerConfig,
} from '@x402/evm/batch-settlement/server';
import { BatchSettlementEvmScheme as ServerBatchSettlementEvmScheme } from '@x402/evm/batch-settlement/server';
import type {
  BatchSettlementDepositPolicy,
  BatchSettlementDepositStrategy,
  ClientChannelStorage,
} from '@x402/evm/batch-settlement/client';
import type { ClientEvmSigner } from '@x402/evm';

import type { BatchChannelStorage } from './batch-channel-storage';
import { createInMemoryBatchChannelStorage } from './in-memory-batch-channel-storage';

type BatchSettlementServerCommonOptions = {
  receiverAuthorizerSigner?: AuthorizerSigner;
  withdrawDelay?: number;
  onchainStateTtlMs?: number;
};

/**
 * Seller-side batch settlement configuration.
 *
 * Development mode may use the bounded process-local default. Production mode
 * deliberately requires a durable, replica-coordinating store.
 */
export type BatchSettlementServerOptions =
  | (BatchSettlementServerCommonOptions & {
      mode: 'development';
      storage?: BatchChannelStorage;
    })
  | (BatchSettlementServerCommonOptions & {
      mode: 'production';
      storage: BatchChannelStorage;
    });

export type ResolvedBatchSettlementServerOptions = {
  storage: BatchChannelStorage;
  schemeConfig: BatchSettlementEvmSchemeServerConfig;
};

/** Buyer-side channel continuation and deposit configuration. */
export type BatchSettlementBuyerOptions = {
  storage?: ClientChannelStorage;
  depositPolicy?: BatchSettlementDepositPolicy;
  depositStrategy?: BatchSettlementDepositStrategy;
  salt?: `0x${string}`;
  payerAuthorizer?: `0x${string}`;
  rpcUrl?: string;
  voucherSigner?: ClientEvmSigner;
};

export type CreateBatchSettlementChannelManagerOptions = {
  receiver: `0x${string}`;
  network: Network;
  facilitator: FacilitatorClient;
  server: BatchSettlementServerOptions;
};

export function resolveBatchSettlementServerOptions(
  options: BatchSettlementServerOptions | undefined
): ResolvedBatchSettlementServerOptions {
  if (!options) {
    throw new Error(
      'x402 batch-settlement requires explicit batchSettlement configuration'
    );
  }
  const storage =
    options.storage ??
    (options.mode === 'development'
      ? createInMemoryBatchChannelStorage()
      : undefined);
  if (!storage) {
    throw new Error(
      'x402 batch-settlement production mode requires durable channel storage'
    );
  }
  if (options.mode === 'production' && storage.durable !== true) {
    throw new Error(
      'x402 batch-settlement production mode requires durable channel storage'
    );
  }
  return {
    storage,
    schemeConfig: {
      storage,
      ...(options.receiverAuthorizerSigner
        ? { receiverAuthorizerSigner: options.receiverAuthorizerSigner }
        : {}),
      ...(options.withdrawDelay === undefined
        ? {}
        : { withdrawDelay: options.withdrawDelay }),
      ...(options.onchainStateTtlMs === undefined
        ? {}
        : { onchainStateTtlMs: options.onchainStateTtlMs }),
    },
  };
}

/**
 * Build the seller operations handle used to claim vouchers, settle claimed
 * funds, and refund/cancel channels. Reuse the runtime's server options with
 * the same injected durable store so HTTP and operations share channel state.
 */
export function createBatchSettlementChannelManager(
  options: CreateBatchSettlementChannelManagerOptions
): {
  scheme: BatchSettlementEvmScheme;
  manager: BatchSettlementChannelManager;
} {
  if (!options.network.startsWith('eip155:')) {
    throw new Error(
      'x402 batch-settlement channel manager requires EVM network'
    );
  }
  const resolved = resolveBatchSettlementServerOptions(options.server);
  const scheme = new ServerBatchSettlementEvmScheme(
    options.receiver,
    resolved.schemeConfig
  );
  return {
    scheme,
    manager: scheme.createChannelManager(options.facilitator, options.network),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Read and validate the incremental amount reported by an upstream batch
 * settlement. The charged delta takes precedence over cumulative/fallback
 * settlement fields and can only reduce the accepted ceiling.
 */
export function resolveBatchSettlementChargedAmount(
  ceiling: bigint,
  settlement: { amount?: string; extra?: Record<string, unknown> }
): bigint {
  const chargedAmount = settlement.extra?.chargedAmount;
  const rawAmount =
    typeof chargedAmount === 'string' && chargedAmount.length > 0
      ? chargedAmount
      : settlement.amount;
  if (!rawAmount || !/^\d+$/u.test(rawAmount)) {
    throw new Error(
      'Batch settlement did not report a non-negative charged amount'
    );
  }
  const actual = BigInt(rawAmount);
  if (actual > ceiling) {
    throw new Error('Batch settlement charged amount exceeds its ceiling');
  }
  return actual;
}

/**
 * Derive stable, non-secret channel and voucher receipt metadata.
 *
 * The settlement id is the channel id plus the cumulative voucher ceiling.
 * Replaying the same voucher therefore yields the same identifier.
 */
export function batchSettlementReceiptHeaders(
  paymentPayload: PaymentPayload,
  settlement: { amount?: string; extra?: Record<string, unknown> }
): Record<string, string> {
  if (paymentPayload.accepted.scheme !== 'batch-settlement') return {};
  const payload = asRecord(paymentPayload.payload);
  const voucher = asRecord(payload?.voucher);
  const channelState = asRecord(asRecord(settlement.extra)?.channelState);
  const channelId =
    nonEmptyString(voucher?.channelId) ??
    nonEmptyString(channelState?.channelId);
  const cumulativeAmount =
    nonEmptyString(voucher?.maxClaimableAmount) ??
    nonEmptyString(channelState?.chargedCumulativeAmount);
  if (!channelId) return {};
  const chargedAmount = nonEmptyString(
    asRecord(settlement.extra)?.chargedAmount
  );
  const settledAmount =
    chargedAmount ??
    nonEmptyString(settlement.amount) ??
    paymentPayload.accepted.amount;

  return {
    'X-Lucid-X402-Channel-ID': channelId.toLowerCase(),
    ...(cumulativeAmount
      ? {
          'X-Lucid-X402-Settlement-ID': `batch:${channelId.toLowerCase()}:${cumulativeAmount}`,
        }
      : {}),
    'X-Lucid-X402-Settled-Amount': settledAmount,
  };
}
