import {
  createMiddleware,
  type RequestServerOptions,
  type RequestServerResult,
} from '@tanstack/react-start';
import type { SolanaAddress } from '@lucid-agents/types/payments';
import { Address, getAddress } from 'viem';
import { exact } from 'x402/schemes';
import { getPaywallHtml } from 'x402/paywall';
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  safeBase64Encode,
  toJsonSafe,
} from 'x402/shared';
import {
  ERC20TokenAmount,
  FacilitatorConfig,
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  PaywallConfig,
  Resource,
  RoutePattern,
  RoutesConfig,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from 'x402/types';
import { useFacilitator } from 'x402/verify';
import { encodePaymentRequiredHeader } from '@lucid-agents/payments';

type RoutesConfigResolver =
  | RoutesConfig
  | (() => RoutesConfig | Promise<RoutesConfig>);
type RoutePatternResolver = () => Promise<RoutePattern[]>;

/**
 * Known testnet network identifiers.
 * This set should be maintained as new testnets are added.
 */
const KNOWN_TESTNETS = new Set([
  'sepolia',
  'goerli',
  'base-sepolia',
  'optimism-sepolia',
  'arbitrum-sepolia',
  'polygon-amoy',
  'solana-devnet',
  'testnet',
  'devnet',
]);

/**
 * Regex pattern to detect common testnet indicators in network names.
 * Matches case-insensitively: testnet, sepolia, goerli, devnet, etc.
 */
const TESTNET_PATTERN = /testnet|sepolia|goerli|devnet|amoy/i;

/**
 * Determines if a network is a testnet by checking against known testnets
 * and common testnet naming patterns.
 * @param network - Network identifier (may be null/undefined)
 * @returns true if the network is a testnet, false otherwise
 */
function isTestnet(network: string | null | undefined): boolean {
  if (!network || typeof network !== 'string') {
    return false;
  }
  const normalized = network.toLowerCase().trim();
  return KNOWN_TESTNETS.has(normalized) || TESTNET_PATTERN.test(normalized);
}

type PaymentHandlerDeps = {
  payTo: Address | SolanaAddress;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
  getRoutePatterns: RoutePatternResolver;
};

type AnyRequestServerOptions = RequestServerOptions<any, any>;
type AnyRequestServerResult = RequestServerResult<any, any, any>;

function createRoutePatternResolver(
  routes: RoutesConfigResolver
): RoutePatternResolver {
  if (typeof routes === 'function') {
    return async () => computeRoutePatterns(await routes());
  }
  const compiled = computeRoutePatterns(routes);
  return async () => compiled;
}

function formatAtomicAmount(
  amount: string | number | bigint,
  decimals: number
): string {
  try {
    const atomic = typeof amount === 'bigint' ? amount : BigInt(amount);
    const base = 10n ** BigInt(decimals);
    const whole = atomic / base;
    const fraction = atomic % base;
    if (fraction === 0n) return whole.toString();
    const fractionStr = fraction
      .toString()
      .padStart(decimals, '0')
      .replace(/0+$/, '');
    return `${whole.toString()}.${fractionStr}`;
  } catch {
    return String(amount);
  }
}

function formatPriceForHeader(price: unknown): string {
  if (typeof price === 'string' || typeof price === 'number') {
    return String(price);
  }
  if (price && typeof price === 'object') {
    const candidate = price as {
      amount?: string | number | bigint;
      asset?: { decimals?: number };
    };
    if (candidate.amount !== undefined) {
      const decimals = candidate.asset?.decimals;
      if (typeof decimals === 'number') {
        return formatAtomicAmount(candidate.amount, decimals);
      }
      return String(candidate.amount);
    }
  }
  const parsed = moneySchema.safeParse(price);
  if (parsed.success) return String(parsed.data);
  return String(price);
}

function jsonResponse(
  payload: Record<string, unknown>,
  status = 402,
  paymentRequiredHeader?: string
) {
  const safePayload = toJsonSafe(payload);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (status === 402 && paymentRequiredHeader) {
    headers.set('PAYMENT-REQUIRED', paymentRequiredHeader);
  }
  return new Response(JSON.stringify(safePayload), {
    status,
    headers,
  });
}

function resolveResource(
  request: Request,
  pathname: string,
  resource?: Resource
): Resource {
  if (resource) return resource;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}${pathname}` as Resource;
}

function createPaymentHandler({
  payTo,
  facilitator,
  paywall,
  getRoutePatterns,
}: PaymentHandlerDeps) {
  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 2;

  return async function handleRequest(
    options: AnyRequestServerOptions
  ): Promise<AnyRequestServerResult> {
    const { request, pathname, context, next } = options;
    const method = request.method.toUpperCase();
    const routePatterns = await getRoutePatterns();
    const matchingRoute = findMatchingRoute(routePatterns, pathname, method);

    if (!matchingRoute) {
      return next();
    }

    const respond = (response: Response): AnyRequestServerResult => ({
      request,
      pathname,
      context,
      response,
    });

    const { price, network, config = {} } = matchingRoute.config;
    const {
      description,
      mimeType,
      maxTimeoutSeconds,
      inputSchema,
      outputSchema,
      customPaywallHtml,
      resource,
      errorMessages,
      discoverable,
    } = config;

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ('error' in atomicAmountForAsset) {
      return respond(new Response(atomicAmountForAsset.error, { status: 500 }));
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;
    let resolvedPayTo: Address | SolanaAddress = payTo;

    const resourceUrl = resolveResource(request, pathname, resource);
    const paymentRequirements: PaymentRequirements[] = [];

    if (SupportedEVMNetworks.includes(network)) {
      const erc20Asset = asset as ERC20TokenAmount['asset'];
      if (!erc20Asset.eip712) {
        throw new Error('EIP-712 configuration missing for EVM network asset');
      }
      resolvedPayTo = getAddress(payTo as Address);
      paymentRequirements.push({
        scheme: 'exact',
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? '',
        mimeType: mimeType ?? 'application/json',
        payTo: resolvedPayTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: getAddress(asset.address),
        outputSchema: {
          input: {
            type: 'http',
            method,
            discoverable: discoverable ?? true,
            ...inputSchema,
          },
          output: outputSchema,
        },
        extra: erc20Asset.eip712,
      });
    } else if (SupportedSVMNetworks.includes(network)) {
      const paymentKinds = await supported();
      let feePayer: string | undefined;
      for (const kind of paymentKinds.kinds) {
        if (kind.network === network && kind.scheme === 'exact') {
          feePayer = kind?.extra?.feePayer;
          break;
        }
      }
      if (!feePayer) {
        throw new Error(
          `The facilitator did not provide a fee payer for network: ${network}.`
        );
      }
      paymentRequirements.push({
        scheme: 'exact',
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? '',
        mimeType: mimeType ?? '',
        payTo: resolvedPayTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: asset.address,
        outputSchema: {
          input: {
            type: 'http',
            method,
            discoverable: discoverable ?? true,
            ...inputSchema,
          },
          output: outputSchema,
        },
        extra: {
          feePayer,
        },
      });
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }

    const paymentRequiredHeader = encodePaymentRequiredHeader({
      price: formatPriceForHeader(price),
      payTo: String(resolvedPayTo),
      network,
      facilitatorUrl: facilitator?.url,
    });

    const paymentHeader =
      request.headers.get('PAYMENT') ?? request.headers.get('X-PAYMENT');
    if (!paymentHeader) {
      const accept = request.headers.get('Accept');
      if (accept?.includes('text/html')) {
        const userAgent = request.headers.get('User-Agent');
        if (userAgent?.includes('Mozilla')) {
          let displayAmount: number;
          if (typeof price === 'string' || typeof price === 'number') {
            const parsed = moneySchema.safeParse(price);
            displayAmount = parsed.success ? parsed.data : Number.NaN;
          } else {
            displayAmount = Number(price.amount) / 10 ** price.asset.decimals;
          }
          const html =
            customPaywallHtml ??
            getPaywallHtml({
              amount: displayAmount,
              paymentRequirements: toJsonSafe(
                paymentRequirements
              ) as Parameters<typeof getPaywallHtml>[0]['paymentRequirements'],
              currentUrl: request.url,
              testnet: isTestnet(network),
              cdpClientKey: paywall?.cdpClientKey,
              appLogo: paywall?.appLogo,
              appName: paywall?.appName,
              sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
            });
          return respond(
            new Response(html, {
              status: 402,
              headers: {
                'Content-Type': 'text/html',
                'PAYMENT-REQUIRED': paymentRequiredHeader,
              },
            })
          );
        }
      }

      return respond(
        jsonResponse({
          x402Version,
          error:
            errorMessages?.paymentRequired ?? 'PAYMENT header is required',
          accepts: paymentRequirements,
        }, 402, paymentRequiredHeader)
      );
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      return respond(
        jsonResponse({
          x402Version,
          error:
            errorMessages?.invalidPayment ??
            (error instanceof Error ? error.message : 'Invalid payment'),
          accepts: paymentRequirements,
        }, 402, paymentRequiredHeader)
      );
    }

    const selectedRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment
    );
    if (!selectedRequirements) {
      return respond(
        jsonResponse({
          x402Version,
          error:
            errorMessages?.noMatchingRequirements ??
            'Unable to find matching payment requirements',
          accepts: toJsonSafe(paymentRequirements),
        }, 402, paymentRequiredHeader)
      );
    }

    const verification = await verify(decodedPayment, selectedRequirements);
    if (!verification.isValid) {
      return respond(
        jsonResponse({
          x402Version,
          error:
            errorMessages?.verificationFailed ?? verification.invalidReason,
          accepts: paymentRequirements,
          payer: verification.payer,
        }, 402, paymentRequiredHeader)
      );
    }

    const nextResult = await next();
    if (nextResult.response.status >= 400) {
      return nextResult;
    }

    try {
      const settlement = await settle(decodedPayment, selectedRequirements);
      if (settlement.success) {
        const enriched = new Response(
          nextResult.response.body,
          nextResult.response
        );
        enriched.headers.set(
          'PAYMENT-RESPONSE',
          safeBase64Encode(
            JSON.stringify({
              success: true,
              transaction: settlement.transaction,
              network: settlement.network,
              payer: settlement.payer,
            })
          )
        );
        return {
          ...nextResult,
          response: enriched,
        };
      }
    } catch (error) {
      return respond(
        jsonResponse({
          x402Version,
          error:
            errorMessages?.settlementFailed ??
            (error instanceof Error ? error.message : 'Settlement failed'),
          accepts: paymentRequirements,
        }, 402, paymentRequiredHeader)
      );
    }

    return nextResult;
  };
}

export function paymentMiddleware(
  payTo: Address | SolanaAddress,
  routes: RoutesConfigResolver,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig
) {
  const handler = createPaymentHandler({
    payTo,
    facilitator,
    paywall,
    getRoutePatterns: createRoutePatternResolver(routes),
  });

  return createMiddleware().server(options => handler(options));
}

export type TanStackRequestMiddleware = ReturnType<
  ReturnType<typeof createMiddleware>['server']
>;

export type { Money, Network, RouteConfig, RoutesConfig } from 'x402/types';
export type { SolanaAddress } from '@lucid-agents/types/payments';
