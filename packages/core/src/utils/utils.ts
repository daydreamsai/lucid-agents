/**
 * Checks if a value has any defined (non-null, non-undefined, non-empty) properties.
 * Generic utility for runtime validation.
 */
export function hasDefinedValue<T extends Record<string, unknown>>(
  value?: T
): value is T {
  if (!value) return false;
  return Object.values(value).some(entry => {
    if (entry === undefined || entry === null) return false;
    return typeof entry === 'string' ? entry.trim().length > 0 : true;
  });
}
