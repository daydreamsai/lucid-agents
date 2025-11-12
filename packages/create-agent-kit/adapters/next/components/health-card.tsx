'use client';

import { useEffect, useState } from 'react';

import { getHealth, type AgentHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

type HealthState = 'loading' | 'healthy' | 'error';

const deriveHealthState = (health: AgentHealth | null): HealthState => {
  if (!health) return 'loading';
  if (health.ok === false) return 'error';
  const status = health.status?.toLowerCase();
  if (status && (status.includes('error') || status.includes('down'))) {
    return 'error';
  }
  return 'healthy';
};

const StatusChip = ({ state }: { state: HealthState }) => {
  const config = {
    healthy: {
      label: 'Healthy',
      icon: '✓',
      className: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
    },
    loading: {
      label: 'Checking',
      icon: '●',
      className:
        'border-amber-500/50 bg-amber-500/10 text-amber-400 animate-pulse',
    },
    error: {
      label: 'Error',
      icon: '✕',
      className: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
    },
  } satisfies Record<
    HealthState,
    { label: string; icon: string; className: string }
  >;

  const { label, icon, className } = config[state];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        className
      )}
    >
      <span className="text-sm">{icon}</span>
      {label}
    </span>
  );
};

export function HealthCard({
  initialHealth,
  className,
}: {
  initialHealth: AgentHealth | null;
  className?: string;
}) {
  const [health, setHealth] = useState<AgentHealth | null>(initialHealth);
  const [state, setState] = useState<HealthState>(() =>
    deriveHealthState(initialHealth)
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const nextHealth = await getHealth();
        if (cancelled) return;
        setHealth(nextHealth);
        setState(deriveHealthState(nextHealth));
      } catch {
        if (!cancelled) {
          setState('error');
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={cn(
        'group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 backdrop-blur-sm transition hover:border-zinc-700',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
            <span className="text-lg">💚</span>
          </div>
          <h2 className="text-base font-semibold text-zinc-100">Health</h2>
        </div>
        <StatusChip state={state} />
      </div>
      <dl className="mt-6 space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <dt className="text-zinc-400">Status</dt>
          <dd className="font-medium text-zinc-100">
            {health?.status ?? (state === 'healthy' ? 'ok' : 'unknown')}
          </dd>
        </div>
        <div className="flex justify-between items-center">
          <dt className="text-zinc-400">Last Checked</dt>
          <dd className="text-zinc-300">{health?.timestamp ?? 'Just now'}</dd>
        </div>
      </dl>
    </div>
  );
}
