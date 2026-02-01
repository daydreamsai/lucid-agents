import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

import { PaymentPolicyGroupsSchema } from './policy-schema';

/**
 * Loads payment policy groups from a config file.
 * Looks for payment-policies.json in the current working directory.
 *
 * @param configPath - Optional path to config file (defaults to 'payment-policies.json' in cwd)
 * @returns Array of validated policy groups, or undefined if file doesn't exist
 * @throws Error if file exists but is invalid
 */
export function loadPoliciesFromConfig(
  configPath?: string
): PaymentPolicyGroup[] | undefined {
  const filePath = configPath ?? join(process.cwd(), 'payment-policies.json');

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(fileContent);

    const result = PaymentPolicyGroupsSchema.safeParse(json);
    if (!result.success) {
      throw new Error(
        `Invalid payment policies config: ${result.error.issues
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }

    return result.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse payment-policies.json: ${error.message}`
      );
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Failed to load payment policies config');
  }
}
