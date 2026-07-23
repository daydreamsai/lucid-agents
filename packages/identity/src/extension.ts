import type {
  AgentManifest,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type {
  IdentityRuntime,
  OASFRecord,
  TrustConfig,
} from '@lucid-agents/types/identity';

import type { IdentityConfig } from './env';
import type { AgentIdentity } from './init';
import {
  createAgentIdentity,
  generateAgentRegistration,
  generateOASFRecord,
  getTrustConfig,
} from './init';
import { createAgentCardWithIdentity } from './manifest';

export type IdentityExtensionRuntime = {
  trust?: TrustConfig;
  identity?: IdentityRuntime & {
    /** Complete identity result, including registry clients and registration state. */
    result?: AgentIdentity;
  };
};

function resolveRequestEndpoint(
  record: OASFRecord,
  requestUrl: string
): OASFRecord {
  if (!record.endpoint.startsWith('/')) return record;
  const endpoint = new URL(record.endpoint, requestUrl);
  return { ...record, endpoint: endpoint.toString() };
}

export function identity(options?: {
  config?: IdentityConfig;
}): Extension<IdentityExtensionRuntime> {
  const config = options?.config;
  let trustConfig: TrustConfig | undefined = config?.trust;

  return {
    name: 'identity',
    after: ['wallets'],
    async build(ctx: BuildContext): Promise<IdentityExtensionRuntime> {
      let identityResult: AgentIdentity | undefined;
      const shouldResolveIdentity =
        !trustConfig &&
        Boolean(
          config?.agentId !== undefined ||
          config?.domain ||
          config?.autoRegister === true
        );

      if (shouldResolveIdentity) {
        identityResult = await createAgentIdentity({
          runtime: ctx.runtime,
          agentId: config?.agentId,
          registrationDiscovery: config?.registrationDiscovery,
          domain: config?.domain,
          autoRegister: config?.autoRegister,
          rpcUrl: config?.rpcUrl,
          chainId: config?.chainId,
          registration: config?.registration,
        });
        trustConfig = getTrustConfig(identityResult);
      }

      const registrationOptions = config?.registration
        ? {
            name: ctx.meta.name,
            description: ctx.meta.description,
            ...config.registration,
          }
        : undefined;
      const metadataIdentity: AgentIdentity = identityResult ?? {
        status: trustConfig
          ? 'Identity trust configured'
          : 'Identity metadata configured',
        domain: config?.domain,
        trust: trustConfig,
      };

      const registration = registrationOptions
        ? generateAgentRegistration(metadataIdentity, registrationOptions)
        : undefined;
      const buildOASFRecord = registrationOptions
        ? (requestUrl: string): OASFRecord | undefined => {
            const record = generateOASFRecord(
              metadataIdentity,
              registrationOptions,
              ctx.runtime
            );
            return record
              ? resolveRequestEndpoint(record, requestUrl)
              : undefined;
          }
        : undefined;

      return {
        trust: trustConfig,
        identity:
          registration || buildOASFRecord || identityResult
            ? { registration, buildOASFRecord, result: identityResult }
            : undefined,
      };
    },
    onManifestBuild(card: AgentManifest): AgentManifest {
      return trustConfig
        ? createAgentCardWithIdentity(card, trustConfig)
        : card;
    },
  };
}
