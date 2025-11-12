'use client';

import {
  type AppKitNetwork,
  base,
  baseSepolia,
  solana,
  solanaDevnet,
} from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import {
  Config,
  cookieStorage,
  cookieToInitialState,
  createStorage,
  WagmiProvider,
} from 'wagmi';

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  base,
  baseSepolia,
  solana,
  solanaDevnet,
];

const projectId =
  process.env.NEXT_PUBLIC_PROJECT_ID ??
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error(
    'NEXT_PUBLIC_PROJECT_ID or NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID is required'
  );
}

const metadata = {
  name: 'Lucid Agent Platform',
  description: 'Full-stack agent platform with x402 micropayments',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: [],
};

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

const solanaAdapter = new SolanaAdapter();

if (typeof window !== 'undefined') {
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

export function AppKitProvider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const [queryClient] = React.useState(() => new QueryClient());
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  );

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
