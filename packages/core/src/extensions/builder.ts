import type {
  AgentManifest,
  AgentMeta,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
  Network,
} from '@lucid-agents/types/core';
import type { z } from 'zod';

import { createAgentCore } from '../core/agent';
import { buildAgentManifest } from '../manifest';

type RequiredKeys<T extends object> = {
  [Key in keyof T]-?: Pick<T, Key> extends Required<Pick<T, Key>> ? Key : never;
}[keyof T];
type RequiredDependencies<T extends object> = Pick<T, RequiredKeys<T>>;

const MAX_MANIFEST_CACHE_ENTRIES = 100;

function orderExtensions(
  extensions: readonly Extension<Record<string, unknown>>[]
): Extension<Record<string, unknown>>[] {
  const byName = new Map<string, Extension<Record<string, unknown>>>();
  const indexByName = new Map<string, number>();
  for (const [index, extension] of extensions.entries()) {
    if (!extension.name?.trim()) {
      throw new Error('Extensions must declare a non-empty name');
    }
    if (byName.has(extension.name)) {
      throw new Error(
        `Extension "${extension.name}" is installed more than once`
      );
    }
    byName.set(extension.name, extension);
    indexByName.set(extension.name, index);
  }

  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const name of byName.keys()) {
    outgoing.set(name, new Set());
    indegree.set(name, 0);
  }

  const addEdge = (before: string, after: string): void => {
    if (before === after) {
      throw new Error(`Extension "${before}" cannot depend on itself`);
    }
    const targets = outgoing.get(before);
    if (!targets || targets.has(after)) return;
    targets.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  };

  for (const extension of extensions) {
    for (const dependency of extension.requires ?? []) {
      if (!byName.has(dependency)) {
        throw new Error(
          `Extension "${extension.name}" requires missing extension "${dependency}"`
        );
      }
      addEdge(dependency, extension.name);
    }
    for (const dependency of extension.after ?? []) {
      if (byName.has(dependency)) addEdge(dependency, extension.name);
    }
    for (const dependent of extension.before ?? []) {
      if (byName.has(dependent)) addEdge(extension.name, dependent);
    }
  }

  const ready = [...byName.keys()]
    .filter(name => indegree.get(name) === 0)
    .sort((left, right) => indexByName.get(left)! - indexByName.get(right)!);
  const ordered: Extension<Record<string, unknown>>[] = [];
  while (ready.length > 0) {
    const name = ready.shift()!;
    ordered.push(byName.get(name)!);
    for (const target of outgoing.get(name) ?? []) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) {
        ready.push(target);
        ready.sort(
          (left, right) => indexByName.get(left)! - indexByName.get(right)!
        );
      }
    }
  }

  if (ordered.length !== extensions.length) {
    const cyclic = [...byName.keys()].filter(
      name => (indegree.get(name) ?? 0) > 0
    );
    throw new Error(`Extension dependency cycle: ${cyclic.join(' -> ')}`);
  }
  return ordered;
}

async function disposeExtensions(
  extensions: readonly Extension<Record<string, unknown>>[],
  runtime: AgentRuntime
): Promise<void> {
  const errors: Error[] = [];
  for (const extension of [...extensions].reverse()) {
    if (!extension.dispose) continue;
    try {
      await extension.dispose(runtime);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `Failed to dispose ${errors.length} extension resource(s): ${errors
        .map(error => error.message)
        .join('; ')}`,
      { cause: errors[0] }
    );
  }
}

export class AgentBuilder<
  Capabilities extends object = Record<never, never>,
  Requirements extends object = Record<never, never>,
> {
  private extensions: Extension<Record<string, unknown>>[] = [];
  private entrypoints: EntrypointDef<
    z.ZodTypeAny | undefined,
    z.ZodTypeAny | undefined,
    AgentRuntime<Capabilities>
  >[] = [];

  constructor(private meta: AgentMeta) {}

  use<Slice extends Record<string, unknown>, Dependencies extends object>(
    extension: Extension<Slice, Dependencies>
  ): AgentBuilder<
    Capabilities & Slice,
    Requirements & RequiredDependencies<Dependencies>
  > {
    this.extensions.push(
      extension as unknown as Extension<Record<string, unknown>>
    );
    return this as unknown as AgentBuilder<
      Capabilities & Slice,
      Requirements & RequiredDependencies<Dependencies>
    >;
  }

  addEntrypoint<
    TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
    TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  >(
    definition: EntrypointDef<TInput, TOutput, AgentRuntime<Capabilities>>
  ): this {
    this.entrypoints.push(definition);
    return this;
  }

  async build(
    this: Capabilities extends Requirements
      ? AgentBuilder<Capabilities, Requirements>
      : never
  ): Promise<AgentRuntime<Capabilities>> {
    const extensions = orderExtensions(this.extensions);
    const agentController = createAgentCore({ meta: this.meta });
    const agent = agentController.agent;
    const manifestCache = new Map<string, AgentManifest>();
    const builtExtensions: Extension<Record<string, unknown>>[] = [];
    const propertyOwners = new Map<string, string>();
    let closePromise: Promise<void> | undefined;

    const snapshotEntrypoints = (): EntrypointDef[] =>
      agent.listEntrypoints().map(entry => ({
        ...entry,
        network: entry.network as Network | undefined,
      })) as EntrypointDef[];
    const listEntrypoints = () =>
      snapshotEntrypoints().map(entry => ({
        key: entry.key,
        description: entry.description,
        streaming: Boolean(entry.stream),
      }));

    const runtime = {
      agent,
      entrypoints: {
        add: definition => agentController.registerEntrypoint(definition),
        list: listEntrypoints,
        snapshot: snapshotEntrypoints,
      },
      manifest: {
        build: (origin: string) => {
          const cached = manifestCache.get(origin);
          if (cached) return cached;

          const knownRuntime = runtime as AgentRuntime<Record<string, unknown>>;
          let card = buildAgentManifest({
            meta: this.meta,
            registry: snapshotEntrypoints(),
            origin,
            stateTransitionHistory: false,
          });
          for (const extension of extensions) {
            if (extension.onManifestBuild) {
              card = extension.onManifestBuild(card, knownRuntime);
            }
          }
          if (manifestCache.size >= MAX_MANIFEST_CACHE_ENTRIES) {
            const oldest = manifestCache.keys().next().value;
            if (typeof oldest === 'string') manifestCache.delete(oldest);
          }
          manifestCache.set(origin, card);
          return card;
        },
        invalidate: () => manifestCache.clear(),
      },
      close: () => {
        closePromise ??= disposeExtensions(
          builtExtensions,
          runtime as unknown as AgentRuntime
        );
        return closePromise;
      },
    } as AgentRuntime<Capabilities>;

    const knownRuntime = runtime as unknown as AgentRuntime &
      Record<string, unknown>;
    const beforeEntrypointAdded = (definition: EntrypointDef): void => {
      if (!definition.key) throw new Error('entrypoint.key required');
      for (const extension of extensions) {
        try {
          extension.onEntrypointAdded?.(definition, knownRuntime);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Extension "${extension.name}" hook onEntrypointAdded failed: ${message}`,
            { cause: error }
          );
        }
      }
    };

    try {
      const context: BuildContext = {
        meta: this.meta,
        runtime: knownRuntime,
      };
      for (const extension of extensions) {
        // An extension may allocate resources before its build result is
        // validated or attached. Include it in rollback as soon as build
        // starts so failures and slice conflicts cannot leak those resources.
        builtExtensions.push(extension);
        let slice: Record<string, unknown>;
        try {
          slice = await extension.build(context);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Extension "${extension.name}" failed to build: ${message}`,
            { cause: error }
          );
        }
        if (!slice || typeof slice !== 'object' || Array.isArray(slice)) {
          throw new Error(
            `Extension "${extension.name}" must return a runtime slice object`
          );
        }
        for (const [key, value] of Object.entries(slice)) {
          const owner = propertyOwners.get(key);
          if (owner || key in runtime) {
            throw new Error(
              `Conflicting extensions: "${owner ?? 'core'}" and "${extension.name}" both define "${key}"`
            );
          }
          knownRuntime[key] = value;
          propertyOwners.set(key, extension.name);
        }
      }

      agentController.configureEntrypointLifecycle({
        beforeAdd: beforeEntrypointAdded,
        afterAdd: () => manifestCache.clear(),
      });
      for (const entrypoint of this.entrypoints) {
        runtime.entrypoints.add(
          entrypoint as unknown as EntrypointDef<
            z.ZodTypeAny | undefined,
            z.ZodTypeAny | undefined,
            AgentRuntime<Capabilities>
          >
        );
      }

      // Initialization is deliberately sequential after every slice exists.
      for (const extension of extensions) {
        if (!extension.initialize) continue;
        try {
          await extension.initialize(knownRuntime);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `Extension "${extension.name}" initialize failed: ${message}`,
            { cause: error }
          );
        }
      }

      return runtime;
    } catch (error) {
      try {
        await disposeExtensions(builtExtensions, knownRuntime);
      } catch (disposeError) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; cleanup failed: ${
            disposeError instanceof Error
              ? disposeError.message
              : String(disposeError)
          }`,
          { cause: error }
        );
      }
      throw error;
    }
  }
}
