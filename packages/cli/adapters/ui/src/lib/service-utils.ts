export function formatServiceValue(value: unknown): string {
  if (value === undefined || value === null) return 'No response yet.';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function offeringPriceLabel(
  invokePrice?: string,
  streamPrice?: string
): string {
  if (!invokePrice && !streamPrice) return 'Free';
  if (invokePrice && streamPrice && invokePrice !== streamPrice) {
    return `${invokePrice} invoke · ${streamPrice} stream`;
  }
  return invokePrice ?? streamPrice ?? 'Free';
}

export function integrationSnippet(
  url: string,
  payload: string,
  streaming = false
): string {
  const body = payload
    .split('\n')
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join('\n');
  return [
    `curl ${streaming ? '-sN ' : '-s '}-X POST \\`,
    `  '${url}' \\`,
    "  -H 'Content-Type: application/json' \\",
    ...(streaming ? ["  -H 'Accept: text/event-stream' \\"] : []),
    "  -d '",
    `  ${body}`,
    "  '",
  ].join('\n');
}
