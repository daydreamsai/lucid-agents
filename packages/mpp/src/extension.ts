import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { MppConfig, MppRuntime, MppPaymentRequirement, MppClientConfig } from './types';
import { resolveEntrypointPrice, resolveEntrypointMppConfig, buildChallengeResponse } from './challenge';
import { buildManifestWithMpp } from './manifest';

/**
 * Check if an entrypoint has a price that should trigger MPP payment.
 */
function entrypointRequiresPayment(entrypoint: EntrypointDef): boolean {
  const { price } = entrypoint;
  if (!price) return false;

  if (typeof price === 'string') return price.trim().length > 0;

  if (typeof price === 'object') {
    const hasInvoke = typeof price.invoke === 'string' && price.invoke.trim().length > 0;
    const hasStream = typeof price.stream === 'string' && price.stream.trim().length > 0;
    return hasInvoke || hasStream;
  }

  return false;
}

/**
 * Create the MPP runtime instance.
 */
function createMppRuntime(config: MppConfig): MppRuntime {
  let isActive = false;

  return {
    get config() {
      return config;
    },
    get isActive() {
      return isActive;
    },
    requirements(
      entrypoint: EntrypointDef,
      kind: 'invoke' | 'stream'
    ): MppPaymentRequirement {
      if (!isActive) return { required: false };

      const price = resolveEntrypointPrice(entrypoint, kind);
      if (!price) return { required: false };

      const mppConfig = resolveEntrypointMppConfig(entrypoint);
      const intent = mppConfig?.intent ?? config.defaultIntent ?? 'charge';
      const currency = mppConfig?.currency ?? config.currency ?? 'usd';
      const description = mppConfig?.description ?? entrypoint.description;
      const methods = mppConfig?.methods ?? config.methods.map(m => m.name);

      const response = buildChallengeResponse({
        amount: mppConfig?.amount ?? price,
        currency,
        intent,
        methods,
        description,
        expirySeconds: config.challengeExpirySeconds,
      });

      return {
        required: true,
        amount: mppConfig?.amount ?? price,
        currency,
        intent,
        methods,
        description,
        response,
      };
    },
    activate(entrypoint: EntrypointDef) {
      if (isActive) return;
      if (entrypointRequiresPayment(entrypoint)) {
        isActive = true;
      }
    },
    resolvePrice(entrypoint: EntrypointDef, which: 'invoke' | 'stream') {
      return resolveEntrypointPrice(entrypoint, which);
    },
    async getMppFetch(clientConfig: MppClientConfig) {
      // Dynamically import mppx client to avoid hard dependency at build time
      try {
        const { Mppx } = await import('mppx/client');
        const mppxClient = Mppx.create({
          methods: clientConfig.methods.map(m => {
            // Return the raw config - mppx expects its own method objects
            // Users should pass mppx method instances directly
            return m.config as any;
          }),
        });
        return mppxClient.fetch.bind(mppxClient);
      } catch (error) {
        console.warn(
          '[lucid-agents/mpp] Failed to create MPP fetch client:',
          (error as Error)?.message ?? error
        );
        return null;
      }
    },
  };
}

/**
 * MPP extension options.
 */
export type MppExtensionOptions = {
  /** MPP configuration. Pass `false` to explicitly disable. */
  config?: MppConfig | false;
};

/**
 * Create the MPP extension for the Lucid Agents builder.
 *
 * @example
 * ```ts
 * import { mpp, tempo } from '@lucid-agents/mpp';
 *
 * const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
 *   .use(http())
 *   .use(mpp({
 *     config: {
 *       methods: [
 *         tempo.server({
 *           currency: '0x20c0000000000000000000000000000000000000',
 *           recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
 *         }),
 *       ],
 *       currency: 'usd',
 *     },
 *   }))
 *   .build();
 * ```
 */
export function mpp(
  options?: MppExtensionOptions
): Extension<{ mpp?: MppRuntime }> {
  let mppRuntime: MppRuntime | undefined;

  return {
    name: 'mpp',
    build(ctx: BuildContext): { mpp?: MppRuntime } {
      if (options?.config === false || !options?.config) {
        return {};
      }

      mppRuntime = createMppRuntime(options.config);
      return { mpp: mppRuntime };
    },
    onEntrypointAdded(entrypoint: EntrypointDef, runtime: AgentRuntime) {
      if (mppRuntime && !mppRuntime.isActive) {
        if (entrypointRequiresPayment(entrypoint)) {
          mppRuntime.activate(entrypoint);
        }
      }
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      if (mppRuntime?.config) {
        return buildManifestWithMpp(
          card,
          mppRuntime.config,
          runtime.entrypoints.snapshot()
        );
      }
      return card;
    },
  };
}
