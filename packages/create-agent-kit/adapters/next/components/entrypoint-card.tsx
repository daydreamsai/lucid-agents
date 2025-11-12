'use client';

import { useWalletClient } from 'wagmi';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  invokeEntrypointWithBody,
  streamEntrypointWithBody,
  type AgentPayments,
} from '@/lib/api';
import { SchemaForm } from '@/components/schema-form';
import { getNetworkInfo } from '@/lib/network';
import { cn } from '@/lib/utils';
import { useCopyFeedback } from '@/components/use-copy-feedback';

export type EntrypointCardData = {
  key: string;
  description: string;
  streaming: boolean;
  priceLabel: string;
  networkId?: string | null;
  invokePath: string;
  streamPath?: string;
  invokeCurl: string;
  streamCurl?: string;
  requiresPayment: boolean;
  inputSchema?: Record<string, any> | null;
  outputSchema?: Record<string, any> | null;
  defaultPayload: string;
};

const formatResult = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (!value) return 'No response body';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

export function EntrypointCard({
  card,
  payments,
}: {
  card: EntrypointCardData;
  payments?: AgentPayments | null;
}) {
  const { data: walletClient } = useWalletClient();
  const [payload, setPayload] = useState(card.defaultPayload);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [paymentUsed, setPaymentUsed] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<
    'idle' | 'streaming' | 'error'
  >('idle');
  const [streamingEvents, setStreamingEvents] = useState<string[]>([]);
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const streamCancelRef = useRef<() => void>();
  const { copyValue: copyCurl, copied: curlCopied } = useCopyFeedback();
  const { copyValue: copyStream, copied: streamCopied } = useCopyFeedback();

  const resetStream = useCallback(() => {
    setStreamingEvents([]);
    setStreamingError(null);
    setStreamingStatus('idle');
    streamCancelRef.current?.();
  }, []);

  const handleInvoke = useCallback(async () => {
    let parsedBody: unknown = {};
    try {
      parsedBody = payload.trim() ? JSON.parse(payload) : {};
      setError(null);
    } catch {
      setError('Payload must be valid JSON');
      return;
    }

    let signer: unknown = undefined;
    let usedPayment = false;
    if (card.requiresPayment && walletClient) {
      signer = walletClient;
      usedPayment = true;
    }

    try {
      const response = await invokeEntrypointWithBody({
        key: card.key,
        body: parsedBody,
        signer,
      });
      setResult(response);
      setPaymentUsed(usedPayment);
    } catch (err) {
      setPaymentUsed(false);
      setError((err as Error).message);
    }
  }, [card.key, card.requiresPayment, payload, walletClient]);

  const handleStream = useCallback(async () => {
    resetStream();

    let parsedBody: unknown = {};
    try {
      parsedBody = payload.trim() ? JSON.parse(payload) : {};
    } catch {
      setStreamingStatus('error');
      setStreamingError('Payload must be valid JSON');
      return;
    }

    let signer: unknown = undefined;
    if (card.requiresPayment && walletClient) {
      signer = walletClient;
    }

    try {
      const { cancel } = await streamEntrypointWithBody({
        key: card.key,
        body: parsedBody,
        signer,
        onChunk: chunk => {
          if (chunk && typeof chunk === 'object' && 'kind' in chunk) {
            if ((chunk as any).kind === 'text') {
              setStreamingEvents(prev => [
                ...prev,
                String((chunk as any).text ?? ''),
              ]);
            }
            if ((chunk as any).kind === 'run-end') {
              setStreamingStatus('idle');
            }
            return;
          }
          setStreamingEvents(prev => [...prev, JSON.stringify(chunk)]);
        },
        onError: err => {
          setStreamingStatus('error');
          setStreamingError(err.message);
        },
        onDone: () => {
          setStreamingStatus('idle');
        },
      });

      streamCancelRef.current = cancel;
      setStreamingStatus('streaming');
    } catch (err) {
      setStreamingStatus('error');
      setStreamingError((err as Error).message);
    }
  }, [card.key, card.requiresPayment, payload, resetStream, walletClient]);

  useEffect(() => {
    return () => {
      streamCancelRef.current?.();
    };
  }, []);

  const networkLabel = getNetworkInfo(
    card.networkId ?? payments?.network ?? undefined
  ).label;

  return (
    <article className="group flex flex-col gap-6 rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-zinc-900/80 to-zinc-900/40 p-6 shadow-xl shadow-black/20 backdrop-blur-sm transition hover:border-zinc-700 hover:shadow-2xl hover:shadow-black/30">
      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-bold text-zinc-50 truncate">
              {card.key}
            </h3>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                card.streaming
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-blue-500/50 bg-blue-500/10 text-blue-400'
              )}
            >
              {card.streaming ? 'Stream' : 'Invoke'}
            </span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {card.description}
          </p>
        </div>
      </header>

      <div className="grid gap-3 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Pricing</span>
          <span className="font-medium text-emerald-400">
            {card.priceLabel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Network</span>
          <span className="text-zinc-300">{networkLabel}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-zinc-500">Invoke Path</span>
          <code className="text-[10px] text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
            {card.invokePath}
          </code>
        </div>
        {card.streamPath && (
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500">Stream Path</span>
            <code className="text-[10px] text-zinc-400 bg-zinc-900/50 px-2 py-1 rounded">
              {card.streamPath}
            </code>
          </div>
        )}
      </div>

      <SchemaForm
        schema={card.inputSchema}
        value={payload}
        onChange={setPayload}
      />

      {card.outputSchema?.properties && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 transition">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">
              ▶
            </span>
            Expected Output Schema
          </summary>
          <div className="mt-2 rounded-lg border border-zinc-800 bg-black/30 p-3">
            <dl className="space-y-2 text-xs">
              {Object.entries(card.outputSchema.properties).map(
                ([name, schema]) => (
                  <div key={name} className="flex gap-2">
                    <dt className="min-w-[100px] font-medium text-zinc-300">
                      {name}:
                    </dt>
                    <dd className="text-zinc-400">
                      {(schema as { type?: string }).type}
                      {(schema as { description?: string }).description
                        ? ` - ${(schema as { description?: string }).description}`
                        : null}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </div>
        </details>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          <span className="text-rose-400">⚠</span>
          <p className="flex-1 text-sm text-rose-300">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleInvoke}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95"
        >
          <span>▶</span>
          Invoke
        </button>
        {card.streaming && (
          <button
            onClick={handleStream}
            disabled={streamingStatus === 'streaming'}
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:border-emerald-500 hover:bg-emerald-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>⚡</span>
            {streamingStatus === 'streaming' ? 'Streaming...' : 'Start Stream'}
          </button>
        )}
        {card.streaming && streamingStatus === 'streaming' && (
          <button
            onClick={resetStream}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-400 transition hover:border-rose-500 hover:bg-rose-500/20 active:scale-95"
          >
            <span>⬛</span>
            Stop
          </button>
        )}
        <button
          onClick={() => copyCurl(card.invokeCurl)}
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
        >
          {curlCopied ? '✓ Copied!' : '📋 Copy cURL'}
        </button>
        {card.streamCurl && (
          <button
            onClick={() => copyStream(card.streamCurl)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {streamCopied ? '✓ Stream cURL!' : '📋 Copy Stream cURL'}
          </button>
        )}
      </div>

      <section className="space-y-4 rounded-xl border border-zinc-800/50 bg-zinc-950/50 p-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Invocation Result
            </span>
            {paymentUsed && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                <span>💰</span>
                Paid
              </span>
            )}
          </div>
        </header>
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3 font-mono text-xs leading-relaxed text-zinc-300">
          {formatResult(result) || (
            <span className="text-zinc-600">
              Click "Invoke" to see the response here...
            </span>
          )}
        </pre>

        {card.streaming && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Stream Events
                </span>
                {streamingStatus === 'streaming' && (
                  <span className="flex h-2 w-2 items-center justify-center">
                    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  streamingStatus === 'streaming'
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                )}
              >
                {streamingStatus === 'streaming' ? '● Live' : '○ Idle'}
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3">
              {streamingEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">
                  Click "Start Stream" to see live events here...
                </p>
              ) : (
                <ul className="space-y-2">
                  {streamingEvents.map((event, index) => (
                    <li
                      key={`${card.key}-event-${index}`}
                      className="animate-fadeIn rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-zinc-200"
                    >
                      {event}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {streamingStatus === 'error' && streamingError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2">
                <span className="text-rose-400">⚠</span>
                <p className="flex-1 text-xs text-rose-300">{streamingError}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </article>
  );
}
