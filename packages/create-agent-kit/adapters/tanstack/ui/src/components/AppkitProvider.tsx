import { createAppKit } from "@reown/appkit/react";

import { WagmiProvider, cookieStorage, createStorage } from "wagmi";
import {
  base,
  baseSepolia,
  solana,
  solanaDevnet,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";

// 0. Setup queryClient
const queryClient = new QueryClient();

// 1. Get projectId from https://dashboard.reown.com
const projectId =
  ((import.meta as any).env?.VITE_PROJECT_ID as string | undefined) ||
  ((import.meta as any).env?.VITE_WALLET_CONNECT_PROJECT_ID as
    | string
    | undefined);
if (!projectId) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing VITE_PROJECT_ID (or VITE_WALLET_CONNECT_PROJECT_ID). Set it in your .env file."
  );
}

// 2. Create a metadata object - optional
const metadata = {
  name: "Lucid Agent Platform",
  description: "Full-stack agent platform with x402 micropayments",
  url: typeof window !== "undefined" ? window.location.origin : "",
  icons: [],
};

// 3. Set the networks (EVM + Solana)
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  base,
  baseSepolia,
  solana,
  solanaDevnet,
];

// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: projectId ?? "",
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

// 4b. Create Solana Adapter
const solanaAdapter = new SolanaAdapter();

// 5. Create modal
if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter, solanaAdapter],
    networks,
    projectId,
    metadata,
    features: {
      analytics: true,
    },
  });
}

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}


