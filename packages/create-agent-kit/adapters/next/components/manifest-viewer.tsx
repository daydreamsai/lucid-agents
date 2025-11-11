'use client';

import { useEffect, useState } from 'react';

import { getManifest } from '@/lib/api';
import { useCopyFeedback } from '@/components/use-copy-feedback';

type ManifestState = 'idle' | 'loading' | 'loaded' | 'error';

export function ManifestViewer({
  initialManifest,
  manifestPath,
}: {
  initialManifest: string;
  manifestPath: string;
}) {
  const [manifestText, setManifestText] = useState(initialManifest);
  const [state, setState] = useState<ManifestState>(() =>
    initialManifest ? 'loaded' : 'idle'
  );
  const { copied, copyValue } = useCopyFeedback();

  useEffect(() => {
    let cancelled = false;
    if (initialManifest) {
      // Hydrate with latest manifest once mounted.
      (async () => {
        try {
          const next = await getManifest();
          if (cancelled) return;
          const text =
            next && typeof next === 'object'
              ? JSON.stringify(next, null, 2)
              : String(next ?? '');
          setManifestText(text);
          setState('loaded');
        } catch {
          if (!cancelled) {
            setState('error');
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const fetchManifest = async () => {
      setState('loading');
      try {
        const manifest = await getManifest();
        if (cancelled) return;
        const text =
          manifest && typeof manifest === 'object'
            ? JSON.stringify(manifest, null, 2)
            : String(manifest ?? '');
        setManifestText(text);
        setState('loaded');
      } catch (error) {
        if (!cancelled) {
          setState('error');
          setManifestText('Failed to load manifest.');
        }
      }
    };

    fetchManifest();
    return () => {
      cancelled = true;
    };
  }, [initialManifest]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
          <span className="text-sm">📄</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Agent Manifest
          </h2>
          <p className="text-sm text-zinc-500">
            Complete agent specification served from{' '}
            <code className="text-xs text-emerald-400">{manifestPath}</code>
          </p>
        </div>
      </div>

      <details className="group rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 backdrop-blur-sm transition hover:border-zinc-700">
        <summary className="flex cursor-pointer items-center justify-between p-6 text-sm font-medium text-zinc-300 hover:text-zinc-100">
          <div className="flex items-center gap-2">
            <span className="inline-block transition-transform group-open:rotate-90">
              ▶
            </span>
            <span>View Full Manifest JSON</span>
            {state === 'loading' && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            )}
          </div>
          <button
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              copyValue(manifestText);
            }}
            className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {copied ? '✓ Copied!' : 'Copy JSON'}
          </button>
        </summary>
        <div className="border-t border-zinc-800/50 p-6">
          <pre className="max-h-[500px] overflow-auto rounded-lg border border-zinc-800/50 bg-zinc-950/80 p-4 font-mono text-xs leading-relaxed text-zinc-300 shadow-inner">
            {state === 'loading' ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                Loading manifest…
              </div>
            ) : (
              manifestText || 'Manifest unavailable.'
            )}
          </pre>
        </div>
      </details>
    </section>
  );
}
