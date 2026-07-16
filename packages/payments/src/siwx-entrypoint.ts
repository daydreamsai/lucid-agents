import type { EntrypointDef } from '@lucid-agents/types/core';

/** Determine whether SIWX applies to an entrypoint. */
export function entrypointHasSIWx(
  entrypoint: EntrypointDef,
  globalSiwx?: { enabled: boolean }
): boolean {
  if (entrypoint.siwx?.authOnly) return true;
  if (entrypoint.siwx?.enabled === false) return false;
  if (entrypoint.siwx?.enabled) return true;
  if (globalSiwx?.enabled && entrypoint.price) return true;
  return false;
}
