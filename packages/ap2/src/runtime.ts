import type { AP2Config, AP2Runtime } from '@lucid-agents/types/ap2';

/**
 * Creates AP2 runtime from configuration.
 * Returns undefined if no config provided.
 */
export function createAP2Runtime(config?: AP2Config): AP2Runtime | undefined {
  if (!config) {
    return undefined;
  }

  return {
    config,
  };
}
