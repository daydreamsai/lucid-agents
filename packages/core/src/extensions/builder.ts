import { buildAgentCard } from '@lucid-agents/a2a';
import type {
  AgentCardWithEntrypoints,
  AgentKitConfig,
  AgentMeta,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';

import { getAgentKitConfig, setActiveInstanceConfig } from '../config/config';
import { createAgentCore } from '../core/agent';
import type { Network } from '../core/types';

export class AgentBuilder {
  private extensions: Extension[] = [];
  private entrypoints: EntrypointDef[] = [];

  constructor(private meta: AgentMeta) {}

  use<E extends Extension>(ext: E): this {
    this.extensions.push(ext);
    return this;
  }

  addEntrypoint(def: EntrypointDef): this {
    this.entrypoints.push(def);
    return this;
  }

  async build(config?: AgentKitConfig): Promise<AgentRuntime> {
    setActiveInstanceConfig(config);
    const resolvedConfig = getAgentKitConfig(config);

    // Create base agent core
    const agent = createAgentCore({
      meta: this.meta,
      wallets: undefined,
      payments: undefined,
    });

    const manifestCache = new Map<string, AgentCardWithEntrypoints>();

    // Build context for extensions
    const buildContext: BuildContext = {
      meta: this.meta,
      config: resolvedConfig,
      runtime: {},
    };

    // Build all extension runtime slices
    const runtimeSlices: Record<string, unknown>[] = [];
    for (const ext of this.extensions) {
      try {
        const slice = ext.build(buildContext);
        runtimeSlices.push(slice);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Extension "${ext.name}" failed to build: ${errorMessage}`,
          { cause: error }
        );
      }
    }

    // Detect conflicts and merge runtime slices
    const mergedRuntime: Record<string, unknown> = {};
    const propertyOwners = new Map<string, string[]>();

    for (let i = 0; i < runtimeSlices.length; i++) {
      const slice = runtimeSlices[i];
      const extName = this.extensions[i]?.name ?? `extension-${i}`;

      for (const [key, value] of Object.entries(slice)) {
        if (key in mergedRuntime) {
          const owners = propertyOwners.get(key) ?? [];
          owners.push(extName);
          propertyOwners.set(key, owners);

          throw new Error(
            `Conflicting extensions: "${owners.join(
              '" and "'
            )}" both add "${key}" property to runtime. Extensions must not conflict.`
          );
        }

        mergedRuntime[key] = value;
        propertyOwners.set(key, [extName]);
      }
    }

    const snapshotEntrypoints = (): EntrypointDef[] =>
      agent.listEntrypoints().map(entry => ({
        ...entry,
        network: entry.network as Network | undefined,
      })) as EntrypointDef[];

    const listEntrypoints = () =>
      snapshotEntrypoints().map(entry => ({
        key: entry.key,
        description: entry.description,
        streaming: Boolean(entry.stream ?? entry.streaming),
      }));

    // Create runtime object with merged slices
    const runtime = {
      ...mergedRuntime,
      agent,
      config: resolvedConfig,
      entrypoints: {
        add: (def: EntrypointDef) => {
          if (!def.key) throw new Error('entrypoint.key required');

          // Call onEntrypointAdded hooks
          for (const ext of this.extensions) {
            if (ext.onEntrypointAdded) {
              try {
                ext.onEntrypointAdded(def, runtime as AgentRuntime);
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                throw new Error(
                  `Extension "${ext.name}" hook onEntrypointAdded failed: ${errorMessage}`,
                  { cause: error }
                );
              }
            }
          }

          agent.addEntrypoint(def);
          manifestCache.clear();
        },
        list: listEntrypoints,
        snapshot: snapshotEntrypoints,
      },
      manifest: {
        build: (origin: string) => {
          const cached = manifestCache.get(origin);
          if (cached) {
            return cached;
          }

          // Build base A2A card
          let card: AgentCardWithEntrypoints;
          if (runtime.a2a) {
            card = (runtime.a2a as any).buildCard(origin);
          } else {
            // Fallback if a2a extension not used - create minimal card
            card = buildAgentCard({
              meta: this.meta,
              registry: snapshotEntrypoints(),
              origin,
            });
          }

          // Apply extension manifest hooks
          for (const ext of this.extensions) {
            if (ext.onManifestBuild) {
              try {
                card = ext.onManifestBuild(card, runtime as AgentRuntime);
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                throw new Error(
                  `Extension "${ext.name}" hook onManifestBuild failed: ${errorMessage}`,
                  { cause: error }
                );
              }
            }
          }

          manifestCache.set(origin, card);
          return card;
        },
        invalidate: () => {
          manifestCache.clear();
        },
      },
    } as AgentRuntime;

    // Add initial entrypoints
    for (const entrypoint of this.entrypoints) {
      runtime.entrypoints.add(entrypoint);
    }

    // Call onBuild hooks after runtime is fully constructed
    // These can be async for initialization that requires async operations
    const onBuildPromises: Promise<void>[] = [];
    for (const ext of this.extensions) {
      if (ext.onBuild) {
        try {
          const result = ext.onBuild(runtime);
          if (result instanceof Promise) {
            onBuildPromises.push(
              result.catch(error => {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                throw new Error(
                  `Extension "${ext.name}" hook onBuild failed: ${errorMessage}`,
                  { cause: error }
                );
              })
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Extension "${ext.name}" hook onBuild failed: ${errorMessage}`,
            { cause: error }
          );
        }
      }
    }

    // Wait for all async onBuild hooks to complete
    if (onBuildPromises.length > 0) {
      await Promise.all(onBuildPromises);
    }

    return runtime;
  }
}
