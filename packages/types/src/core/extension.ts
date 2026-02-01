import type { AgentCardWithEntrypoints, AgentMeta } from '../a2a';
import type { EntrypointDef } from './entrypoint';
import type { AgentRuntime } from './runtime';

/**
 * Build context provided to extensions during build.
 */
export type BuildContext = {
  meta: AgentMeta;
  runtime: Partial<AgentRuntime>;
};

/**
 * Extension interface. Each extension contributes a runtime slice.
 */
export interface Extension<R extends Record<string, unknown> = {}> {
  /**
   * Unique name of the extension (for debugging and conflict detection).
   */
  name: string;

  /**
   * Builds the extension's runtime slice.
   * Called during AgentBuilder.build() to construct the runtime.
   */
  build: (ctx: BuildContext) => R;

  /**
   * Optional hook called when an entrypoint is added to the runtime.
   * Useful for extensions that need to activate/enable themselves per entrypoint.
   */
  onEntrypointAdded?: (
    entrypoint: EntrypointDef,
    runtime: AgentRuntime
  ) => void;

  /**
   * Optional hook called after all extensions are built.
   * Useful for final setup that requires the complete runtime.
   * Can be async for initialization that requires async operations.
   */
  onBuild?: (runtime: AgentRuntime) => void | Promise<void>;

  /**
   * Optional hook called when building the manifest/agent card.
   * Can modify the card before it's returned.
   */
  onManifestBuild?: (
    card: AgentCardWithEntrypoints,
    runtime: AgentRuntime
  ) => AgentCardWithEntrypoints;
}

/**
 * Type utility to convert a union of types to an intersection.
 * Used for merging extension runtime types.
 *
 * @example
 * ```typescript
 * type A = { a: string };
 * type B = { b: number };
 * type Combined = UnionToIntersection<A | B>; // { a: string } & { b: number }
 * ```
 */
export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Type utility to extract the runtime type from an array of extensions.
 * Merges all extension runtime slices into a single type.
 *
 * This is useful for type inference when using the extension system:
 *
 * @example
 * ```typescript
 * const payments = payments({ config });
 * const http = http();
 * type MyRuntime = AppRuntime<[typeof payments, typeof http]>;
 * ```
 */
export type AppRuntime<Es extends Extension[]> = UnionToIntersection<
  Es[number] extends Extension<infer R> ? R : never
>;
