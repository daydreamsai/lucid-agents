import type { AP2ExtensionDescriptor, AP2Role } from './ap2';
import { AP2_EXTENSION_URI } from './ap2';
import { resolveEntrypointPrice } from './pricing';
import type {
  AgentCapabilities,
  AgentCardWithEntrypoints,
  AgentMeta,
  AP2Config,
  EntrypointDef,
  Manifest,
  PaymentMethod,
  PaymentsConfig,
  TrustConfig,
} from './types';
import { toJsonSchemaOrUndefined } from './utils';

export function buildManifest({
  meta,
  registry,
  origin,
  payments,
  ap2,
  trust,
}: {
  meta: AgentMeta;
  registry: Iterable<EntrypointDef>;
  origin: string;
  payments?: PaymentsConfig;
  ap2?: AP2Config;
  trust?: TrustConfig;
}): AgentCardWithEntrypoints {
  const entrypoints: Manifest['entrypoints'] = {};
  const entrypointList = Array.from(registry);
  const anyStreaming = entrypointList.some(e => Boolean(e.stream));

  for (const e of entrypointList) {
    const manifestEntry: Manifest['entrypoints'][string] = {
      description: e.description,
      streaming: Boolean(e.stream),
      input_schema: toJsonSchemaOrUndefined(e.input),
      output_schema: toJsonSchemaOrUndefined(e.output),
    };
    const invP = resolveEntrypointPrice(e, payments, 'invoke');
    const strP = e.stream
      ? resolveEntrypointPrice(e, payments, 'stream')
      : undefined;
    if (invP || strP) {
      const pricing: NonNullable<typeof manifestEntry.pricing> = {};
      if (invP) pricing.invoke = invP;
      if (strP) pricing.stream = strP;
      manifestEntry.pricing = pricing;
    }
    entrypoints[e.key] = manifestEntry;
  }

  const defaultInputModes = ['application/json'];
  const defaultOutputModes = ['application/json', 'text/plain'];
  const skills = entrypointList.map(e => ({
    id: e.key,
    name: e.key,
    description: e.description,
    inputModes: defaultInputModes,
    outputModes: defaultOutputModes,
    streaming: Boolean(e.stream),
    x_input_schema: toJsonSchemaOrUndefined(e.input),
    x_output_schema: toJsonSchemaOrUndefined(e.output),
  }));

  const capabilities: AgentCapabilities = {
    streaming: anyStreaming,
    pushNotifications: false,
    stateTransitionHistory: true,
  };

  const resolvedAp2Config: AP2Config | undefined =
    ap2 ?? (payments ? { roles: ['merchant'], required: true } : undefined);
  if (resolvedAp2Config?.roles?.length) {
    const [firstRole, ...restRoles] = resolvedAp2Config.roles;
    if (!firstRole) {
      throw new Error('AP2 roles must contain at least one entry');
    }
    const roles: [AP2Role, ...AP2Role[]] = [firstRole, ...restRoles];
    const extension: AP2ExtensionDescriptor = {
      uri: AP2_EXTENSION_URI,
      description:
        resolvedAp2Config.description ?? 'Agent Payments Protocol (AP2)',
      required: resolvedAp2Config.required ?? roles.includes('merchant'),
      params: { roles },
    };
    const existing = capabilities.extensions ?? [];
    const withoutAp2 = existing.filter(
      ext => !('uri' in ext && ext.uri === AP2_EXTENSION_URI)
    );
    capabilities.extensions = [...withoutAp2, extension];
  }

  const card: AgentCardWithEntrypoints = {
    name: meta.name,
    description: meta.description,
    url: origin.endsWith('/') ? origin : `${origin}/`,
    version: meta.version,
    provider: undefined,
    capabilities,
    defaultInputModes,
    defaultOutputModes,
    skills,
    supportsAuthenticatedExtendedCard: false,
    entrypoints,
  };

  if (payments) {
    const pm = payments;
    const paymentMethod: PaymentMethod = {
      method: 'x402',
      payee: pm.payTo,
      network: pm.network,
      endpoint: pm.facilitatorUrl,
      priceModel: pm.defaultPrice ? { default: pm.defaultPrice } : undefined,
      extensions: {
        x402: { facilitatorUrl: pm.facilitatorUrl },
      },
    };
    card.payments = [paymentMethod];
  }

  if (trust) {
    if (trust.registrations?.length) {
      card.registrations = trust.registrations;
    }
    if (trust.trustModels?.length) {
      const unique = Array.from(new Set(trust.trustModels));
      card.trustModels = unique;
    }
    if (trust.validationRequestsUri) {
      card.ValidationRequestsURI = trust.validationRequestsUri;
    }
    if (trust.validationResponsesUri) {
      card.ValidationResponsesURI = trust.validationResponsesUri;
    }
    if (trust.feedbackDataUri) {
      card.FeedbackDataURI = trust.feedbackDataUri;
    }
  }

  return card;
}
