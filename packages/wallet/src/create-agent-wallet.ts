import {
  LocalEoaWalletConnector,
  type LocalEoaWalletConnectorOptions,
} from './local-eoa-connector';
import { createPrivateKeySigner } from './private-key-signer';
import {
  ServerOrchestratorWalletConnector,
  type ServerOrchestratorWalletConnectorOptions,
} from './server-orchestrator-connector';
import type {
  AgentWalletFactoryOptions,
  AgentWalletHandle,
  LocalWalletOptions,
  LucidWalletOptions,
  WalletConnector,
} from '@lucid-agents/types/wallets';
import type { AgentKitConfig } from '@lucid-agents/types/core';

export const createAgentWallet = (
  options: AgentWalletFactoryOptions
): AgentWalletHandle => {
  if (options.type === 'local') {
    return buildLocalWallet(options);
  }
  return buildLucidWallet(options);
};

const buildLocalWallet = (options: LocalWalletOptions): AgentWalletHandle => {
  const signer =
    options.signer ??
    (options.privateKey ? createPrivateKeySigner(options.privateKey) : null);

  if (!signer) {
    throw new Error(
      'Local wallet configuration requires either a signer or privateKey'
    );
  }

  const connector = new LocalEoaWalletConnector(
    resolveLocalConnectorOptions(options, signer)
  );

  return {
    kind: 'local',
    connector,
  };
};

const resolveLocalConnectorOptions = (
  options: LocalWalletOptions,
  signer: LocalEoaWalletConnectorOptions['signer']
): LocalEoaWalletConnectorOptions => ({
  signer,
  address: options.address ?? null,
  caip2: options.caip2 ?? null,
  chain: options.chain ?? null,
  chainType: options.chainType ?? null,
  provider: options.provider ?? (options.privateKey ? 'local' : undefined),
  label: options.label ?? null,
});

const buildLucidWallet = (options: LucidWalletOptions): AgentWalletHandle => {
  const connector = new ServerOrchestratorWalletConnector(
    resolveLucidConnectorOptions(options)
  );

  return {
    kind: 'lucid',
    connector,
    setAccessToken: token => connector.setAccessToken(token),
  };
};

const resolveLucidConnectorOptions = (
  options: LucidWalletOptions
): ServerOrchestratorWalletConnectorOptions => ({
  baseUrl: options.baseUrl,
  agentRef: options.agentRef,
  fetch: options.fetch,
  headers: options.headers,
  accessToken: options.accessToken ?? null,
  authorizationContext: options.authorizationContext,
});

export type WalletsRuntime = {
  agent?: AgentWalletHandle;
  developer?: AgentWalletHandle;
} | undefined;

export function createWalletsRuntime(
  config: AgentKitConfig
): WalletsRuntime {
  if (!config.wallets) {
    return undefined;
  }

  return {
    agent: config.wallets.agent
      ? createAgentWallet(config.wallets.agent)
      : undefined,
    developer: config.wallets.developer
      ? createAgentWallet(config.wallets.developer)
      : undefined,
  };
}
