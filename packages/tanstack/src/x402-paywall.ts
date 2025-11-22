import {
  createMiddleware,
  type RequestServerOptions,
  type RequestServerResult,
} from "@tanstack/react-start";
import type { SolanaAddress } from "@lucid-agents/types/payments";
import { Address, getAddress } from "viem";
import { exact } from "x402/schemes";
import { getPaywallHtml } from "x402/paywall";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  safeBase64Encode,
  toJsonSafe,
} from "x402/shared";
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
} from "x402/types";
import { useFacilitator } from "x402/verify";

type RoutesConfigResolver = RoutesConfig | (() => RoutesConfig | Promise<RoutesConfig>);
type RoutePatternResolver = () => Promise<RoutePattern[]>;

type PaymentHandlerDeps = {
  payTo: Address | SolanaAddress;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
  getRoutePatterns: RoutePatternResolver;
};

type AnyRequestServerOptions = RequestServerOptions<any, any>;
type AnyRequestServerResult = RequestServerResult<any, any, any>;

function createRoutePatternResolver(routes: RoutesConfigResolver): RoutePatternResolver {
  if (typeof routes === "function") {
    return async () => computeRoutePatterns(await routes());
  }
  const compiled = computeRoutePatterns(routes);
  return async () => compiled;
}

function jsonResponse(payload: unknown, status = 402) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
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
  const x402Version = 1;

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
    if ("error" in atomicAmountForAsset) {
      return respond(new Response(atomicAmountForAsset.error, { status: 500 }));
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl = resolveResource(request, pathname, resource);
    const paymentRequirements: PaymentRequirements[] = [];

    if (SupportedEVMNetworks.includes(network)) {
      paymentRequirements.push({
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "application/json",
        payTo: getAddress(payTo),
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: getAddress(asset.address),
        outputSchema: {
          input: {
            type: "http",
            method,
            discoverable: discoverable ?? true,
            ...inputSchema,
          },
          output: outputSchema,
        },
        extra: (asset as ERC20TokenAmount["asset"]).eip712,
      });
    } else if (SupportedSVMNetworks.includes(network)) {
      const paymentKinds = await supported();
      let feePayer: string | undefined;
      for (const kind of paymentKinds.kinds) {
        if (kind.network === network && kind.scheme === "exact") {
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
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "",
        payTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: asset.address,
        outputSchema: {
          input: {
            type: "http",
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

    const paymentHeader = request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      const accept = request.headers.get("Accept");
      if (accept?.includes("text/html")) {
        const userAgent = request.headers.get("User-Agent");
        if (userAgent?.includes("Mozilla")) {
          let displayAmount: number;
          if (typeof price === "string" || typeof price === "number") {
            const parsed = moneySchema.safeParse(price);
            displayAmount = parsed.success ? parsed.data : Number.NaN;
          } else {
            displayAmount = Number(price.amount) / 10 ** price.asset.decimals;
          }
          const html =
            customPaywallHtml ??
            getPaywallHtml({
              amount: displayAmount,
              paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
                typeof getPaywallHtml
              >[0]["paymentRequirements"],
              currentUrl: request.url,
              testnet: network === "base-sepolia",
              cdpClientKey: paywall?.cdpClientKey,
              appLogo: paywall?.appLogo,
              appName: paywall?.appName,
              sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
            });
          return respond(
            new Response(html, {
              status: 402,
              headers: { "Content-Type": "text/html" },
            })
          );
        }
      }

      return respond(
        jsonResponse({
          x402Version,
          error: errorMessages?.paymentRequired ?? "X-PAYMENT header is required",
          accepts: paymentRequirements,
        })
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
            (error instanceof Error ? error.message : "Invalid payment"),
          accepts: paymentRequirements,
        })
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
            "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
        })
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
        })
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
          "X-PAYMENT-RESPONSE",
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
            (error instanceof Error ? error.message : "Settlement failed"),
          accepts: paymentRequirements,
        })
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

  return createMiddleware().server((options) => handler(options));
}

export type TanStackRequestMiddleware = ReturnType<
  ReturnType<typeof createMiddleware>["server"]
>;

export type { Money, Network, RouteConfig, RoutesConfig } from "x402/types";
export type { SolanaAddress as SolanaChainAddress } from "@lucid-agents/types/payments";

