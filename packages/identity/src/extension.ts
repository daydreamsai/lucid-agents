import type {
  AgentManifest,
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type {
  IdentityRuntime,
  OASFRecord,
  TrustConfig,
} from '@lucid-agents/types/identity';
import type { WalletsRuntime } from '@lucid-agents/types/wallets';

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

function hasWallets(
  runtime: AgentRuntime & Record<string, unknown>
): runtime is AgentRuntime<{ wallets: WalletsRuntime }> &
  Record<string, unknown> {
  const wallets = runtime.wallets as WalletsRuntime | undefined;
  return Boolean(wallets?.developer || wallets?.agent);
}

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
        Boolean(config?.domain || config?.autoRegister !== undefined);

      if (shouldResolveIdentity) {
        if (!hasWallets(ctx.runtime)) {
          throw new Error(
            'Identity auto-registration requires a developer or agent wallet. ' +
              'Install wallets() or provide identity.config.trust.'
          );
        }
        identityResult = await createAgentIdentity({
          runtime: ctx.runtime,
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
