import type { MppServerMethod } from '@lucid-agents/types/mpp';

/** Built-in verifier implementation selected for an MPP method. */
export type MppMethodImplementation =
  | 'tempo'
  | 'tempo-session'
  | 'stripe'
  | 'evm'
  | 'custom';

/** Resolve the verifier implementation used by an MPP method descriptor. */
export function resolveMppMethodImplementation(
  method: MppServerMethod
): MppMethodImplementation {
  if (method.implementation) return method.implementation;
  if (method.name === 'tempo') return 'tempo';
  if (method.name === 'stripe') return 'stripe';
  if (method.name === 'evm') return 'evm';
  return 'custom';
}
