const docsEventNames = [
  'page_view',
  'path_selected',
  'scaffold_command_copied',
  'skill_install_command_copied',
] as const;

type DocsEventName = (typeof docsEventNames)[number];

export type DocsEvent = {
  name: DocsEventName;
  path: string;
  stage?: string;
};

export function isDocsEvent(value: unknown): value is DocsEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (
    !Object.keys(event).every(key => ['name', 'path', 'stage'].includes(key))
  ) {
    return false;
  }
  const validStage =
    event.name === 'page_view'
      ? event.stage === undefined ||
        [
          'install',
          'seller-quickstart',
          'buyer-quickstart',
          'production',
        ].includes(String(event.stage))
      : event.name === 'path_selected'
        ? ['seller', 'buyer', 'application'].includes(String(event.stage))
        : event.name === 'scaffold_command_copied'
          ? event.stage === 'install'
          : event.name === 'skill_install_command_copied'
            ? event.stage === 'install'
            : false;
  return (
    typeof event.name === 'string' &&
    docsEventNames.includes(event.name as DocsEventName) &&
    typeof event.path === 'string' &&
    event.path.startsWith('/') &&
    event.path.length <= 256 &&
    validStage
  );
}

export function trackDocsEvent(event: DocsEvent): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify(event);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      '/api/docs-events',
      new Blob([body], { type: 'application/json' })
    );
    return;
  }
  void fetch('/api/docs-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  });
}
