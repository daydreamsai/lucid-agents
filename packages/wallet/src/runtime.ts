import type {
  AgentWalletConfig,
  AgentWalletHandle,
  DeveloperWalletConfig,
  DeveloperWalletHandle,
  LocalWalletOptions,
  LucidWalletOptions,
  SignerWalletOptions,
  ThirdwebWalletOptions,
  WalletsConfig,
  WalletsRuntime,
} from '@lucid-agents/types/wallets';

import {
  createPrivateKeySigner,
  LocalEoaWalletConnector,
  type LocalEoaWalletConnectorOptions,
} from './connectors/local-eoa-connector';
import {
  ServerOrchestratorWalletConnector,
  type ServerOrchestratorWalletConnectorOptions,
} from './connectors/server-orchestrator-connector';
import {
  ThirdwebWalletConnector,
  type ThirdwebWalletConnectorOptions,
} from './connectors/thirdweb-connector';
import { ViemWalletConnector } from './connectors/viem-wallet-connector';

export const createAgentWallet = (
  options: AgentWalletConfig
): AgentWalletHandle => {
  if (options.type === 'local') {
    return buildLocalWallet(options);
  }
  if (options.type === 'signer') {
    return buildSignerWallet(options);
  }
  if (options.type === 'thirdweb') {
    return buildThirdwebWallet(options);
  }
  return buildLucidWallet(options);
};

const buildLocalWallet = (options: LocalWalletOptions): AgentWalletHandle => {
  const signer = createPrivateKeySigner(options.privateKey);

  const connector = new LocalEoaWalletConnector(
    resolveLocalConnectorOptions(options, signer)
  );

  return {
    kind: 'local',
    connector,
  };
};

const buildSignerWallet = (options: SignerWalletOptions): AgentWalletHandle => {
  const connector = new ViemWalletConnector({
    walletClient: options.walletClient,
    metadata: {
      address: options.address ?? null,
      caip2: options.caip2 ?? null,
      chain: options.chain ?? null,
      chainType: options.chainType ?? null,
      provider: options.provider ?? null,
      label: options.label ?? null,
    },
  });

  return {
    kind: 'signer',
    connector,
  };
};

/**
 * Creates a developer wallet handle.
 * Developer wallets can be local (private key-based) or signer (wallet client-based).
 */
export const createDeveloperWallet = (
  options: DeveloperWalletConfig
): DeveloperWalletHandle => {
  if (options.type === 'local') {
    const signer = options.privateKey
      ? createPrivateKeySigner(options.privateKey)
      : null;

    if (!signer) {
      throw new Error('Developer wallet configuration requires a privateKey');
    }

    const connector = new LocalEoaWalletConnector(
      resolveLocalConnectorOptions(options, signer)
    );

    return {
      kind: 'local',
      connector,
    };
  }

  if (options.type === 'signer') {
    const connector = new ViemWalletConnector({
      walletClient: options.walletClient,
      metadata: {
        address: options.address ?? null,
        caip2: options.caip2 ?? null,
        chain: options.chain ?? null,
        chainType: options.chainType ?? null,
        provider: options.provider ?? null,
        label: options.label ?? null,
      },
    });

    return {
      kind: 'local',
      connector,
    };
  }

  throw new Error('Developer wallets must be local or signer type');
};

const resolveLocalConnectorOptions = (
  options: LocalWalletOptions | SignerWalletOptions,
  signer: LocalEoaWalletConnectorOptions['signer']
): LocalEoaWalletConnectorOptions => ({
  signer,
  address: options.address ?? null,
  caip2: options.caip2 ?? null,
  chain: options.chain ?? null,
  chainType: options.chainType ?? null,
  provider:
    options.provider ?? (options.type === 'local' ? 'local' : undefined),
  label: options.label ?? null,
  walletClient: options.walletClient ?? null,
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

const buildThirdwebWallet = (
  options: ThirdwebWalletOptions
): AgentWalletHandle => {
  const connector = new ThirdwebWalletConnector(
    resolveThirdwebConnectorOptions(options)
  );

  return {
    kind: 'thirdweb',
    connector,
  };
};

const resolveThirdwebConnectorOptions = (
  options: ThirdwebWalletOptions
): ThirdwebWalletConnectorOptions => ({
  secretKey: options.secretKey,
  clientId: options.clientId,
  walletLabel: options.walletLabel,
  chainId: options.chainId,
  address: options.address ?? null,
  caip2: options.caip2 ?? null,
  chain: options.chain ?? null,
  chainType: options.chainType ?? null,
  label: options.label ?? null,
});

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

export function createWalletsRuntime(
  config: WalletsConfig | undefined
): WalletsRuntime {
  if (!config) {
    return undefined;
  }

  return {
    agent: config.agent ? createAgentWallet(config.agent) : undefined,
    developer: config.developer
      ? createDeveloperWallet(config.developer)
      : undefined,
  };
}
