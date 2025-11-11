'use client';

import { createAppKit } from '@reown/appkit/react';
import {
  Config,
  WagmiProvider,
  cookieStorage,
  cookieToInitialState,
  createStorage,
} from 'wagmi';
import {
  base,
  baseSepolia,
  solana,
  solanaDevnet,
  type AppKitNetwork,
} from '@reown/appkit/networks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import React, { type ReactNode } from 'react';

const queryClient = new QueryClient();

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  base,
  baseSepolia,
  solana,
  solanaDevnet,
];

const projectId =
  process.env.NEXT_PUBLIC_PROJECT_ID ??
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

if (typeof window !== 'undefined' && !projectId) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing NEXT_PUBLIC_PROJECT_ID (or NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID). Set it in your .env file.'
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
  projectId: projectId ?? '',
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

const solanaAdapter = new SolanaAdapter();

if (typeof window !== 'undefined' && projectId) {
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
