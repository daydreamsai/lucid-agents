import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type {
  FacilitatorClient,
  FacilitatorConfig,
} from '@x402/core/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { SupportedResponse } from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { createRequire } from 'node:module';
import { createFacilitatorAuthHeaders } from '../utils';
import type { CircleGatewayConfig, CircleGatewayFacilitatorDeps } from './types';

const CIRCLE_GATEWAY_MISSING_DEP_ERROR =
  '[agent-kit-payments] Circle Gateway support requires optional peer dependency @circle-fin/x402-batching';

const DEFAULT_NETWORK_PATTERN = 'eip155:*';

const requireModule = createRequire(import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function loadCircleGatewayFacilitatorDeps(): CircleGatewayFacilitatorDeps {
  try {
    const serverModule = requireModule('@circle-fin/x402-batching/server');
    const rootModule = requireModule('@circle-fin/x402-batching');

    if (
      !isRecord(serverModule) ||
      !isRecord(rootModule) ||
      typeof serverModule.BatchFacilitatorClient !== 'function' ||
      typeof serverModule.GatewayEvmScheme !== 'function' ||
      typeof rootModule.isBatchPayment !== 'function'
    ) {
      throw new Error(
        '[agent-kit-payments] Invalid @circle-fin/x402-batching exports'
      );
    }

    return {
      BatchFacilitatorClient:
        serverModule.BatchFacilitatorClient as CircleGatewayFacilitatorDeps['BatchFacilitatorClient'],
      GatewayEvmScheme:
        serverModule.GatewayEvmScheme as CircleGatewayFacilitatorDeps['GatewayEvmScheme'],
      isBatchPayment:
        rootModule.isBatchPayment as CircleGatewayFacilitatorDeps['isBatchPayment'],
    };
  } catch (error) {
    throw new Error(CIRCLE_GATEWAY_MISSING_DEP_ERROR, { cause: error });
  }
}

function addFacilitatorAuth(
  facilitator: FacilitatorConfig,
  token?: string
): FacilitatorConfig {
  if (facilitator.createAuthHeaders) {
    return facilitator;
  }

  const authHeaders = createFacilitatorAuthHeaders(token);
  if (!authHeaders) {
    return facilitator;
  }

  return {
    ...facilitator,
    createAuthHeaders: async () => authHeaders,
  };
}

function resolveFacilitatorConfig({
  payments,
  facilitator,
}: CircleGatewayConfig): FacilitatorConfig {
  const baseFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: payments.facilitatorUrl } satisfies FacilitatorConfig);
  return addFacilitatorAuth(baseFacilitator, payments.facilitatorAuth);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function mergeSupportedResponses(
  responses: SupportedResponse[]
): SupportedResponse {
  const kinds: SupportedResponse['kinds'] = [];
  const kindKeys = new Set<string>();
  const extensions: string[] = [];
  const signers: Record<string, string[]> = {};

  for (const response of responses) {
    for (const kind of response.kinds) {
      const key = `${kind.x402Version}|${kind.scheme}|${kind.network}`;
      if (kindKeys.has(key)) {
        continue;
      }
      kindKeys.add(key);
      kinds.push(kind);
    }

    extensions.push(...response.extensions);

    for (const [scheme, rawSchemeSigners] of Object.entries(
      response.signers ?? {}
    )) {
      const schemeSigners = Array.isArray(rawSchemeSigners)
        ? rawSchemeSigners.map(signer => String(signer))
        : [];
      const existing = signers[scheme] ?? [];
      signers[scheme] = uniqueValues([...existing, ...schemeSigners]);
    }
  }

  return {
    kinds,
    extensions: uniqueValues(extensions),
    signers,
  };
}

export function isCircleGatewayFacilitator(
  payments?: PaymentsConfig
): boolean {
  return payments?.facilitator === 'circle-gateway';
}

export function createCircleGatewayFacilitator(
  config: CircleGatewayConfig,
  depsArg?: CircleGatewayFacilitatorDeps
): FacilitatorClient {
  const deps = depsArg ?? loadCircleGatewayFacilitatorDeps();
  const facilitatorConfig = resolveFacilitatorConfig(config);

  const standardFacilitator =
    deps.createStandardFacilitatorClient?.(facilitatorConfig) ??
    new HTTPFacilitatorClient(facilitatorConfig);
  const batchFacilitator = new deps.BatchFacilitatorClient({
    url: facilitatorConfig.url,
    createAuthHeaders: facilitatorConfig.createAuthHeaders,
  });

  return {
    verify: async (paymentPayload, paymentRequirements) => {
      if (deps.isBatchPayment(paymentRequirements)) {
        return batchFacilitator.verify(paymentPayload, paymentRequirements);
      }
      return standardFacilitator.verify(paymentPayload, paymentRequirements);
    },
    settle: async (paymentPayload, paymentRequirements) => {
      if (deps.isBatchPayment(paymentRequirements)) {
        return batchFacilitator.settle(paymentPayload, paymentRequirements);
      }
      return standardFacilitator.settle(paymentPayload, paymentRequirements);
    },
    getSupported: async () => {
      const [batchResult, standardResult] = await Promise.allSettled([
        batchFacilitator.getSupported(),
        standardFacilitator.getSupported(),
      ]);

      const responses: SupportedResponse[] = [];
      if (batchResult.status === 'fulfilled') {
        responses.push(batchResult.value);
      }
      if (standardResult.status === 'fulfilled') {
        responses.push(standardResult.value);
      }

      if (responses.length > 0) {
        return mergeSupportedResponses(responses);
      }

      if (batchResult.status === 'rejected') {
        throw batchResult.reason;
      }
      if (standardResult.status === 'rejected') {
        throw standardResult.reason;
      }
      throw new Error(
        '[agent-kit-payments] Failed to resolve supported gateway facilitator kinds'
      );
    },
  };
}

export function createPaymentsFacilitatorClient(
  config: CircleGatewayConfig,
  depsArg?: CircleGatewayFacilitatorDeps
): FacilitatorClient {
  if (isCircleGatewayFacilitator(config.payments)) {
    return createCircleGatewayFacilitator(config, depsArg);
  }

  const facilitatorConfig = resolveFacilitatorConfig(config);
  return new HTTPFacilitatorClient(facilitatorConfig);
}

export function createPaymentSchemeRegistrations(
  payments: PaymentsConfig,
  depsArg?: CircleGatewayFacilitatorDeps
): Array<{ network: string; server: unknown }> {
  if (isCircleGatewayFacilitator(payments)) {
    const deps = depsArg ?? loadCircleGatewayFacilitatorDeps();
    return [
      {
        network: DEFAULT_NETWORK_PATTERN,
        server: new deps.GatewayEvmScheme(),
      },
    ];
  }

  return [
    {
      network: DEFAULT_NETWORK_PATTERN,
      server: new ExactEvmScheme(),
    },
  ];
}
