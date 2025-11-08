/**
 * Domain normalization utilities
 */

/**
 * Normalize a domain to lowercase, trimmed format
 */
export function normalizeDomain(domain: string): string {
  return domain?.trim?.().toLowerCase?.() ?? '';
}
