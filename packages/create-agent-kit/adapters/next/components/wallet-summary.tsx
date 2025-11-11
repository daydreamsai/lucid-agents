'use client';

import { useAccount } from 'wagmi';

import { cn } from '@/lib/utils';

export function WalletSummary({ className }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const projectId =
    process.env.NEXT_PUBLIC_PROJECT_ID ??
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;
  const mode = 'appkit' as const;
  const requiresProjectId = !projectId;

  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300',
        className
      )}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-zinc-500">
        <span>Wallet Status</span>
        <span className="font-medium text-zinc-400">
          {mode === 'appkit' ? 'WalletConnect' : 'Local'}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Connected</span>
          <span className="font-medium text-zinc-200">
            {isConnected ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Address</span>
          <span className="truncate font-mono text-[13px] text-zinc-100">
            {address ?? '—'}
          </span>
        </div>
        {mode === 'appkit' && requiresProjectId && (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-300">
            Provide <code>NEXT_PUBLIC_PROJECT_ID</code> to enable WalletConnect.
          </p>
        )}
      </div>
    </div>
  );
}
