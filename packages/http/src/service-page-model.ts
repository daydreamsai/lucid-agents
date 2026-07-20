import type {
  AgentCardWithEntrypoints,
  PaymentMethod,
} from '@lucid-agents/types/a2a';
import type { ManifestEntrypoint } from '@lucid-agents/types/core';

/** Public health payload accepted when deriving storefront status. */
export type ServicePageHealthInput = {
  ok?: boolean;
  status?: string;
  version?: string;
} | null;

/** Normalized service status displayed by generated storefronts. */
export type ServicePageStatus = {
  state: 'online' | 'degraded' | 'offline' | 'unknown';
  label: string;
};

/** Public URL, path, and optional price for an offering operation. */
export type ServicePageOperation = {
  path: string;
  url: string;
  price?: string;
};

/** Storefront-ready description of one invokable agent offering. */
export type ServicePageOffering = {
  key: string;
  title: string;
  description: string;
  streaming: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
  authorization?: {
    siwx: {
      enabled: boolean;
      authOnly: boolean;
      statement?: string;
      network?: string;
    };
  };
  payment: {
    required: boolean;
    protocol?: string;
    network?: string;
  };
  operations: {
    invoke: ServicePageOperation;
    stream?: ServicePageOperation;
  };
};

/** Framework-neutral public service model shared by every generated UI. */
export type ServicePageModel = {
  agent: {
    name: string;
    version?: string;
    description?: string;
    iconUrl?: string;
  };
  status: ServicePageStatus;
  trust: {
    registered: boolean;
    signed: boolean;
    registrations: NonNullable<AgentCardWithEntrypoints['registrations']>;
    models: NonNullable<AgentCardWithEntrypoints['trustModels']>;
  };
  capabilities: {
    streaming: boolean;
    tasks: boolean;
    extensions: Array<{
      name: string;
      uri?: string;
      required: boolean;
    }>;
  };
  endpoints: {
    agentCard: string;
    health: string;
    entrypoints: string;
    tasks?: string;
  };
  payments: Array<{
    method: string;
    network: string;
    detail?: string;
  }>;
  offerings: ServicePageOffering[];
};

/** Inputs that supplement the public Agent Card when building a service page. */
export type BuildServicePageModelOptions = {
  health?: ServicePageHealthInput;
  /** Override the public HTTP base URL advertised by the Agent Card. */
  baseUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function publicBaseUrl(
  card: AgentCardWithEntrypoints,
  override?: string
): string {
  const advertised =
    override ?? card.supportedInterfaces?.[0]?.url ?? card.url ?? '';
  return trimTrailingSlash(advertised);
}

function endpointPath(baseUrl: string, suffix: string): string {
  if (!baseUrl) return suffix;
  try {
    const pathname = new URL(baseUrl).pathname.replace(/\/+$/, '');
    return `${pathname}${suffix}` || suffix;
  } catch {
    const pathname = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
    return `${pathname.replace(/\/+$/, '')}${suffix}`;
  }
}

function endpointUrl(baseUrl: string, suffix: string): string {
  return baseUrl ? `${baseUrl}${suffix}` : suffix;
}

function statusFromHealth(health: ServicePageHealthInput | undefined) {
  if (health === undefined || health === null) {
    return { state: 'unknown', label: 'Status unknown' } as const;
  }
  const status = health.status?.toLowerCase() ?? '';
  if (
    health.ok === true ||
    status.includes('ok') ||
    status.includes('healthy') ||
    status.includes('online')
  ) {
    return { state: 'online', label: 'Online' } as const;
  }
  if (status.includes('degraded')) {
    return { state: 'degraded', label: 'Degraded' } as const;
  }
  return { state: 'offline', label: 'Unavailable' } as const;
}

function titleFromKey(key: string): string {
  return key
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function extensionSummary(extension: Record<string, unknown>) {
  const uri = typeof extension.uri === 'string' ? extension.uri : undefined;
  const description =
    typeof extension.description === 'string'
      ? extension.description
      : undefined;
  const fallbackName = uri
    ? (uri.split('/').filter(Boolean).pop() ?? 'Additional capability')
    : 'Additional capability';
  return {
    name: description ?? fallbackName,
    ...(uri ? { uri } : {}),
    required: extension.required === true,
  };
}

function paymentDetail(method: PaymentMethod): string | undefined {
  if (method.method !== 'mpp' || !isRecord(method.extensions?.mpp)) {
    return undefined;
  }
  const descriptor = method.extensions.mpp;
  const parts = [descriptor.method, descriptor.currency].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function paymentForOffering(
  entrypoint: ManifestEntrypoint,
  methods: PaymentMethod[]
): ServicePageOffering['payment'] {
  const required = Boolean(
    entrypoint.pricing?.invoke || entrypoint.pricing?.stream
  );
  if (!required) return { required: false };

  const protocol =
    entrypoint.payment_protocol ??
    (methods.length === 1 ? methods[0]?.method : undefined);
  const method = protocol
    ? methods.find(candidate => candidate.method === protocol)
    : undefined;
  const network = entrypoint.network ?? method?.network;

  return {
    required: true,
    ...(protocol ? { protocol } : {}),
    ...(network ? { network } : {}),
  };
}

function authorizationForOffering(
  entrypoint: ManifestEntrypoint
): ServicePageOffering['authorization'] {
  const siwx = entrypoint.authorization?.siwx;
  if (!siwx) return undefined;
  return {
    siwx: {
      enabled: siwx.enabled,
      authOnly: siwx.auth_only,
      ...(siwx.statement ? { statement: siwx.statement } : {}),
      ...(siwx.network ? { network: siwx.network } : {}),
    },
  };
}

/**
 * Builds the framework-neutral view model used by every generated service UI.
 * Only public Agent Card and health data are accepted at this boundary.
 */
export function buildServicePageModel(
  card: AgentCardWithEntrypoints,
  options: BuildServicePageModelOptions = {}
): ServicePageModel {
  const baseUrl = publicBaseUrl(card, options.baseUrl);
  const methods = card.payments ?? [];
  const supportsTasks = card.capabilities?.stateTransitionHistory === true;
  const offerings = Object.entries(card.entrypoints ?? {}).map(
    ([key, entrypoint]): ServicePageOffering => {
      const encodedKey = encodeURIComponent(key);
      const invokeSuffix = `/entrypoints/${encodedKey}/invoke`;
      const streamSuffix = `/entrypoints/${encodedKey}/stream`;
      const authorization = authorizationForOffering(entrypoint);
      return {
        key,
        title: titleFromKey(key),
        description:
          entrypoint.description ?? 'No description has been provided.',
        streaming: entrypoint.streaming,
        ...(entrypoint.input_schema !== undefined
          ? { inputSchema: entrypoint.input_schema }
          : {}),
        ...(entrypoint.output_schema !== undefined
          ? { outputSchema: entrypoint.output_schema }
          : {}),
        ...(authorization ? { authorization } : {}),
        payment: paymentForOffering(entrypoint, methods),
        operations: {
          invoke: {
            path: endpointPath(baseUrl, invokeSuffix),
            url: endpointUrl(baseUrl, invokeSuffix),
            ...(entrypoint.pricing?.invoke
              ? { price: entrypoint.pricing.invoke }
              : {}),
          },
          ...(entrypoint.streaming
            ? {
                stream: {
                  path: endpointPath(baseUrl, streamSuffix),
                  url: endpointUrl(baseUrl, streamSuffix),
                  ...(entrypoint.pricing?.stream
                    ? { price: entrypoint.pricing.stream }
                    : {}),
                },
              }
            : {}),
        },
      };
    }
  );

  return {
    agent: {
      name: card.name,
      ...(card.version ? { version: card.version } : {}),
      ...(card.description ? { description: card.description } : {}),
      ...(card.iconUrl ? { iconUrl: card.iconUrl } : {}),
    },
    status: statusFromHealth(options.health),
    trust: {
      registered: Boolean(card.registrations?.length),
      signed: Boolean(card.signatures?.length),
      registrations: card.registrations ?? [],
      models: card.trustModels ?? [],
    },
    capabilities: {
      streaming:
        card.capabilities?.streaming === true ||
        offerings.some(offering => offering.streaming),
      tasks: supportsTasks,
      extensions: (card.capabilities?.extensions ?? [])
        .filter(isRecord)
        .map(extensionSummary),
    },
    endpoints: {
      agentCard: endpointUrl(baseUrl, '/.well-known/agent-card.json'),
      health: endpointUrl(baseUrl, '/health'),
      entrypoints: endpointUrl(baseUrl, '/entrypoints'),
      ...(supportsTasks ? { tasks: endpointUrl(baseUrl, '/tasks') } : {}),
    },
    payments: methods.map(method => {
      const detail = paymentDetail(method);
      return {
        method: method.method,
        network: method.network,
        ...(detail ? { detail } : {}),
      };
    }),
    offerings,
  };
}
