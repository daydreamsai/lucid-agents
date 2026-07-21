export function redact(
  value: string,
  sensitiveValues: ReadonlySet<string>
): string {
  let redacted = value;
  const ordered = [...sensitiveValues]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const sensitive of ordered) {
    const variants = new Set([
      sensitive,
      JSON.stringify(sensitive).slice(1, -1),
      encodeURIComponent(sensitive),
    ]);
    for (const variant of variants) {
      if (variant) redacted = redacted.replaceAll(variant, '<redacted>');
    }
  }
  return redacted;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
