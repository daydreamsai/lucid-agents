import type { Extension } from '@lucid-agents/types/core';
import {
  capabilitiesToJson,
  cashoutResultToJson,
  createCashClient,
  estimateToJson,
  fillStatsToJson,
  orderToJson,
  preparedStepToJson,
  preparedTxToJson,
  prepareResultToJson,
  usdc,
  type CashCapabilitiesJson,
  type CashClient,
  type CashoutResultJson,
  type CashEstimateJson,
  type CashFillStatsJson,
  type CashOrderJson,
  type CashPreparedStepJson,
  type PrepareResultJson,
  type PreparedTransactionJson,
  type PreparedCashoutReceipt,
  type OrdersOptions,
  type CurrencyType,
  type RuntimeEnv,
} from '@zkp2p/cash';

export type PeerCashOptions = {
  environment?: RuntimeEnv;
  referralCode?: string;
  referrer?: string | string[];
  rpcUrl?: string;
  /** Dependency injection boundary for tests and custom hosts. */
  client?: CashClient;
};

export type PeerCashRuntime = {
  capabilities(): CashCapabilitiesJson;
  fillStats(): Promise<CashFillStatsJson>;
  estimate(input: PeerCashEstimateInput): Promise<CashEstimateJson>;
  prepareCashout(input: PeerCashoutInput): Promise<PrepareResultJson>;
  order(depositId: string): Promise<CashOrderJson>;
  orders(owner: string, options?: OrdersOptions): Promise<CashOrderJson[]>;
  prepareWithdrawal(
    depositId: string,
    options?: PeerCashWithdrawalOptions
  ): Promise<PeerCashPreparedPlan>;
  prepareTopUp(
    depositId: string,
    amountUsdc: string
  ): Promise<PeerCashPreparedPlan>;
  prepareAccessPolicy(depositId: string): PreparedTransactionJson;
  finalizeCashout(receipt: PreparedCashoutReceipt): CashoutResultJson;
};

export type PeerCashPreparedPlan = {
  txs: PreparedTransactionJson[];
  steps: CashPreparedStepJson[];
};

export type PeerCashWithdrawalOptions = {
  amountUsdc?: string;
};

export type PeerCashEstimateInput = {
  amountUsdc: string;
  currency: string;
  platform?: string;
  includeEta?: boolean;
};

export type PeerCashoutInput = {
  amountUsdc: string;
  platform: string;
  currency: string;
  payee: string;
  minimumFillUsdc?: string;
  maximumFillUsdc?: string;
};

function intentAmountRange(input: PeerCashoutInput) {
  if (
    (input.minimumFillUsdc === undefined) !==
    (input.maximumFillUsdc === undefined)
  ) {
    throw new Error(
      'minimumFillUsdc and maximumFillUsdc must be provided together'
    );
  }
  if (
    input.minimumFillUsdc === undefined ||
    input.maximumFillUsdc === undefined
  ) {
    return undefined;
  }
  return {
    min: usdc(input.minimumFillUsdc),
    max: usdc(input.maximumFillUsdc),
  };
}

function serializePreparedPlan(plan: {
  txs: Parameters<typeof preparedTxToJson>[0][];
  steps: Parameters<typeof preparedStepToJson>[0][];
}): PeerCashPreparedPlan {
  return {
    txs: plan.txs.map(preparedTxToJson),
    steps: plan.steps.map(preparedStepToJson),
  };
}

export function peerCash(
  options: PeerCashOptions = {}
): Extension<{ peerCash: PeerCashRuntime }> {
  return {
    name: 'peer-cash',
    build() {
      const client =
        options.client ??
        createCashClient({
          environment: options.environment ?? 'production',
          referralCode: options.referralCode,
          referrer: options.referrer ?? 'lucid-agents',
          rpcUrl: options.rpcUrl,
        });

      return {
        peerCash: {
          capabilities: () => capabilitiesToJson(client.capabilities()),
          fillStats: async () => fillStatsToJson(await client.fillStats()),
          estimate: async input =>
            estimateToJson(
              await client.estimate(
                {
                  amount: usdc(input.amountUsdc),
                  currency: input.currency.toUpperCase() as CurrencyType,
                  platform: input.platform,
                },
                { includeEta: input.includeEta !== false }
              )
            ),
          prepareCashout: async input =>
            prepareResultToJson(
              await client.prepare({
                amount: usdc(input.amountUsdc),
                receive: {
                  platform: input.platform,
                  currency: input.currency.toUpperCase() as CurrencyType,
                  payee: input.payee,
                },
                intentAmountRange: intentAmountRange(input),
              })
            ),
          order: async depositId => orderToJson(await client.order(depositId)),
          orders: async (owner, ordersOptions) =>
            (await client.orders(owner, ordersOptions)).map(orderToJson),
          prepareWithdrawal: async (depositId, withdrawalOptions) => {
            const plan = await client.prepareWithdraw(depositId, {
              amount:
                withdrawalOptions?.amountUsdc === undefined
                  ? undefined
                  : usdc(withdrawalOptions.amountUsdc),
            });
            return serializePreparedPlan(plan);
          },
          prepareTopUp: async (depositId, amountUsdc) => {
            const plan = await client.prepareTopUp(depositId, usdc(amountUsdc));
            return serializePreparedPlan(plan);
          },
          prepareAccessPolicy: depositId =>
            preparedTxToJson(client.prepareAccessPolicy(depositId)),
          finalizeCashout: receipt =>
            cashoutResultToJson(client.finalizePreparedCashout(receipt)),
        },
      };
    },
  };
}
