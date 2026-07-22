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

export function endpointPathLabel(value: string): string {
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || value;
  } catch {
    return value;
  }
}

const FACT_TAGS = new Set(['free', 'paid', 'invoke', 'stream']);

export function visibleOfferingTags(
  tags: string[] | undefined,
  protocol?: string,
  network?: string
): string[] {
  const facts = new Set(FACT_TAGS);
  if (protocol) facts.add(protocol.toLowerCase());
  if (network) facts.add(network.toLowerCase());
  return (tags ?? []).filter(tag => !facts.has(tag.trim().toLowerCase()));
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
