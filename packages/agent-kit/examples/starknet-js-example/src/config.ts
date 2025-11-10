const DEFAULT_ETH_CONTRACT =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // ETH on Sepolia

type StarknetConfig = {
  rpcUrl: string;
  accountAddress?: string;
  privateKey?: string;
  ethContractAddress: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

let cachedConfig: StarknetConfig | null = null;

export function readStarknetConfig(): StarknetConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = {
    rpcUrl: requireEnv("STARKNET_RPC_URL"),
    accountAddress: optionalEnv("STARKNET_ACCOUNT_ADDRESS"),
    privateKey: optionalEnv("STARKNET_PRIVATE_KEY"),
    ethContractAddress:
      process.env.STARKNET_ETH_CONTRACT?.trim() || DEFAULT_ETH_CONTRACT,
  };

  return cachedConfig;
}

export { DEFAULT_ETH_CONTRACT };
