export type NetworkInfo = {
  id: string;
  label: string;
  chainId: number;
  faucetUrl?: string;
  explorerUrl?: string;
};

const NETWORKS: Record<string, NetworkInfo> = {
  base: {
    id: 'base',
    label: 'Base Mainnet',
    chainId: 8453,
    explorerUrl: 'https://basescan.org',
  },
  'base-sepolia': {
    id: 'base-sepolia',
    label: 'Base Sepolia (Testnet)',
    chainId: 84532,
    faucetUrl: 'https://coins.github.io/#base-sepolia',
    explorerUrl: 'https://sepolia.basescan.org',
  },
  optimism: {
    id: 'optimism',
    label: 'Optimism',
    chainId: 10,
    explorerUrl: 'https://optimistic.etherscan.io',
  },
  'optimism-sepolia': {
    id: 'optimism-sepolia',
    label: 'Optimism Sepolia (Testnet)',
    chainId: 11155420,
    faucetUrl: 'https://www.alchemy.com/faucets/optimism-sepolia',
    explorerUrl: 'https://sepolia-optimistic.etherscan.io',
  },
};

export function getNetworkInfo(id?: string | null): NetworkInfo {
  if (!id) {
    return NETWORKS['base-sepolia'];
  }
  return (
    NETWORKS[id] ?? {
      id,
      label: id,
      chainId: 84532,
    }
  );
}
