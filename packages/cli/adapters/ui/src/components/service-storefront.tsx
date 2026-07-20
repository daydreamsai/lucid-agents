'use client';

import {
  createServicePayloadExample,
  type ServicePageModel,
  type ServicePageOffering,
} from '@lucid-agents/http';
import type { TaskAccess } from '@lucid-agents/types/a2a';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWalletClient } from 'wagmi';

import { WalletSummary } from '@/components/wallet-summary';
import {
  createInvocationState,
  invocationReducer,
  redactInvocationError,
  type InvocationEvent,
  type InvocationState,
} from '@/lib/invocation-state';
import {
  cancelServiceTask,
  createServiceTask,
  getServiceTask,
  invokeServiceOperation,
  paymentNetworkMismatch,
  streamServiceOperation,
  type SolanaWalletLike,
} from '@/lib/service-client';
import {
  formatServiceValue,
  integrationSnippet,
  offeringPriceLabel,
} from '@/lib/service-utils';

type ServiceStorefrontProps = {
  service: ServicePageModel;
  manifest: unknown;
};

function phaseLabel(state: InvocationState): string {
  const labels: Record<InvocationState['phase'], string> = {
    ready: 'Ready to run',
    invalid: 'Check the input',
    preparing: 'Preparing request',
    authorization: 'Wallet authorization required',
    payment: 'Payment readiness required',
    'network-mismatch': 'Network change required',
    running: 'Running',
    partial: 'Receiving output',
    success: 'Completed',
    'recoverable-error': 'Request needs attention',
    cancelled: 'Cancelled',
  };
  return labels[state.phase];
}

function chunkText(chunk: unknown): string {
  if (chunk && typeof chunk === 'object') {
    const record = chunk as Record<string, unknown>;
    if (record.kind === 'text') return String(record.text ?? '');
    if (record.kind === 'delta') return String(record.delta ?? '');
    if (record.kind === 'run-end' && record.output !== undefined) {
      return formatServiceValue(record.output);
    }
  }
  return formatServiceValue(chunk);
}

function AgentHeader({ service }: { service: ServicePageModel }) {
  const trustSignals = [
    service.trust.registered ? 'Registered identity' : null,
    service.trust.signed ? 'Signed Agent Card' : null,
    ...service.trust.models,
  ].filter((value): value is string => Boolean(value));
  return (
    <header className="service-header">
      <div className="service-kicker">
        <span className={`status-dot status-${service.status.state}`} />
        {service.status.label}
        {service.agent.version ? ` · v${service.agent.version}` : ''}
      </div>
      <h1>{service.agent.name}</h1>
      <p className="service-purpose">
        {service.agent.description ??
          'This agent has not published a description yet.'}
      </p>
      {trustSignals.length > 0 ? (
        <ul className="trust-line" aria-label="Trust signals">
          {trustSignals.map(signal => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

function OfferingList({
  offerings,
  selectedKey,
  onSelect,
}: {
  offerings: ServicePageOffering[];
  selectedKey?: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="offering-rail" aria-label="Agent offerings">
      <div className="section-label">Offerings</div>
      {offerings.length === 0 ? (
        <div className="empty-state">
          <strong>No offerings published</strong>
          <span>
            Entrypoints will appear here when the service registers them.
          </span>
        </div>
      ) : (
        <ul className="offering-list">
          {offerings.map(offering => (
            <li key={offering.key}>
              <button
                type="button"
                className={offering.key === selectedKey ? 'is-selected' : ''}
                aria-current={offering.key === selectedKey ? 'true' : undefined}
                onClick={() => onSelect(offering.key)}
              >
                <span className="offering-title">{offering.title}</span>
                <span className="offering-description">
                  {offering.description}
                </span>
                <span className="offering-meta">
                  {offeringPriceLabel(
                    offering.operations.invoke.price,
                    offering.operations.stream?.price
                  )}
                  {' · '}
                  {offering.streaming ? 'Invoke or stream' : 'Invoke'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function ServiceDetails({
  service,
  manifest,
}: {
  service: ServicePageModel;
  manifest: unknown;
}) {
  const [copied, setCopied] = useState(false);
  const copyManifest = async () => {
    await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <section
      className="service-details"
      aria-labelledby="service-details-title"
    >
      <div>
        <div className="section-label" id="service-details-title">
          Service details
        </div>
        <dl className="detail-list">
          <div>
            <dt>Agent Card</dt>
            <dd>
              <a href={service.endpoints.agentCard}>Open JSON</a>
            </dd>
          </div>
          <div>
            <dt>Entrypoints</dt>
            <dd>
              <a href={service.endpoints.entrypoints}>Inspect endpoint</a>
            </dd>
          </div>
          {service.endpoints.tasks ? (
            <div>
              <dt>A2A tasks</dt>
              <dd>Available</dd>
            </div>
          ) : null}
          <div>
            <dt>Trust</dt>
            <dd>
              {service.trust.registered
                ? `${service.trust.registrations.length} registration${service.trust.registrations.length === 1 ? '' : 's'}`
                : 'No registration published'}
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <div className="section-label">Public capabilities</div>
        <ul className="capability-list">
          {service.payments.map(payment => (
            <li key={`${payment.method}-${payment.network}`}>
              <strong>{payment.method}</strong>
              <span>{payment.detail ?? payment.network}</span>
            </li>
          ))}
          {service.capabilities.extensions.map(extension => (
            <li key={extension.uri ?? extension.name}>
              <strong>{extension.name}</strong>
              <span>{extension.required ? 'Required' : 'Supported'}</span>
            </li>
          ))}
          {service.payments.length === 0 &&
          service.capabilities.extensions.length === 0 ? (
            <li>
              <span>No additional capabilities published.</span>
            </li>
          ) : null}
        </ul>
        <button className="text-button" type="button" onClick={copyManifest}>
          {copied ? 'Manifest copied' : 'Copy manifest'}
        </button>
      </div>
    </section>
  );
}

function OfferingWorkspace({
  offering,
  state,
  dispatch,
  service,
  mppCredential,
  setMppCredential,
  onInvoke,
  onStream,
  onTask,
  onCancel,
  onBack,
}: {
  offering: ServicePageOffering;
  state: InvocationState;
  dispatch: (event: InvocationEvent) => void;
  service: ServicePageModel;
  mppCredential: string;
  setMppCredential: (value: string) => void;
  onInvoke: () => void;
  onStream: () => void;
  onTask: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [showIntegration, setShowIntegration] = useState(false);
  const [copied, setCopied] = useState(false);
  const protectedOperation =
    offering.payment.required || offering.authorization?.siwx.enabled;
  const busy = state.phase === 'running' || state.phase === 'partial';
  const snippet = integrationSnippet(
    offering.operations.invoke.url,
    state.payload
  );
  const copySnippet = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="offering-workspace" aria-labelledby="offering-title">
      <button type="button" className="mobile-back" onClick={onBack}>
        Back to offerings
      </button>
      <header className="workspace-header">
        <div>
          <div className="section-label">Selected offering</div>
          <h2 id="offering-title" tabIndex={-1}>
            {offering.title}
          </h2>
          <p>{offering.description}</p>
        </div>
        <div className="operation-facts">
          <span>
            {offeringPriceLabel(
              offering.operations.invoke.price,
              offering.operations.stream?.price
            )}
          </span>
          {offering.payment.protocol ? (
            <span>{offering.payment.protocol}</span>
          ) : null}
          {offering.payment.network ? (
            <span>{offering.payment.network}</span>
          ) : null}
        </div>
      </header>

      <section className="input-section" aria-labelledby="input-title">
        <div className="section-heading-row">
          <div className="section-label" id="input-title">
            Input
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              dispatch({
                type: 'SET_PAYLOAD',
                payload: createServicePayloadExample(offering.inputSchema),
              })
            }
          >
            Reset example
          </button>
        </div>
        <label className="sr-only" htmlFor={`payload-${offering.key}`}>
          JSON input for {offering.title}
        </label>
        <textarea
          id={`payload-${offering.key}`}
          value={state.payload}
          spellCheck={false}
          onChange={event =>
            dispatch({ type: 'SET_PAYLOAD', payload: event.target.value })
          }
          aria-describedby={`run-status-${offering.key}`}
        />
      </section>

      {protectedOperation ? (
        <section
          className="readiness-panel"
          aria-label="Authorization and payment readiness"
        >
          <div>
            <strong>Protected operation</strong>
            <p>
              Wallet and payment controls are used only when you run this
              offering.
            </p>
          </div>
          <WalletSummary className="wallet-summary" />
          {offering.payment.protocol === 'mpp' ? (
            <label className="credential-field">
              <span>MPP credential</span>
              <input
                type="password"
                autoComplete="off"
                value={mppCredential}
                onChange={event => setMppCredential(event.target.value)}
                placeholder="Paste a Payment credential"
              />
              <small>Kept in memory for this page session only.</small>
            </label>
          ) : null}
        </section>
      ) : null}

      <div className="run-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={onInvoke}
        >
          {busy ? 'Running' : 'Invoke'}
        </button>
        {offering.operations.stream ? (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={onStream}
          >
            Stream
          </button>
        ) : null}
        {service.endpoints.tasks ? (
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={onTask}
          >
            Run as task
          </button>
        ) : null}
        {busy || state.taskStatus === 'running' ? (
          <button
            className="text-button danger"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <section
        className={`run-state state-${state.phase}`}
        id={`run-status-${offering.key}`}
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="run-state-heading">
          <span className="state-indicator" aria-hidden="true" />
          <strong>{phaseLabel(state)}</strong>
          {state.paymentUsed ? (
            <span className="state-note">Payment accepted</span>
          ) : null}
        </div>
        {state.error ? <p className="error-message">{state.error}</p> : null}
        {state.taskId ? (
          <p className="task-reference">
            Task {state.taskId} · {state.taskStatus}
          </p>
        ) : null}
        {state.stream.length > 0 ? (
          <pre>{state.stream.join('')}</pre>
        ) : state.result !== undefined ? (
          <pre>{formatServiceValue(state.result)}</pre>
        ) : (
          <p className="run-placeholder">
            Results and streaming output will appear here.
          </p>
        )}
      </section>

      <section className="integration-section">
        <button
          type="button"
          className="integration-toggle"
          aria-expanded={showIntegration}
          onClick={() => setShowIntegration(value => !value)}
        >
          Integration details
          <span>{showIntegration ? 'Hide' : 'Show'}</span>
        </button>
        {showIntegration ? (
          <div className="integration-body">
            <div className="endpoint-line">
              <span>POST</span>
              <code>{offering.operations.invoke.path}</code>
            </div>
            <pre>{snippet}</pre>
            <button className="text-button" type="button" onClick={copySnippet}>
              {copied ? 'Copied' : 'Copy cURL'}
            </button>
            {offering.outputSchema ? (
              <details>
                <summary>Output schema</summary>
                <pre>{JSON.stringify(offering.outputSchema, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>
    </article>
  );
}

export function ServiceStorefront({
  service,
  manifest,
}: ServiceStorefrontProps) {
  const { data: walletClient } = useWalletClient();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider: solanaProvider } =
    useAppKitProvider<SolanaWalletLike['provider']>('solana');
  const solanaNetwork = solanaAccount.caipAddress
    ?.split(':')
    .slice(0, 2)
    .join(':');
  const solanaWallet = useMemo<SolanaWalletLike>(
    () => ({
      address: solanaAccount.address,
      network: solanaNetwork,
      provider: solanaProvider,
    }),
    [solanaAccount.address, solanaNetwork, solanaProvider]
  );
  const initialOffering = service.offerings[0];
  const [selectedKey, setSelectedKey] = useState(initialOffering?.key);
  const [showMobileList, setShowMobileList] = useState(false);
  const [invocations, setInvocations] = useState<
    Record<string, InvocationState>
  >(() =>
    Object.fromEntries(
      service.offerings.map(offering => [
        offering.key,
        createInvocationState(
          createServicePayloadExample(offering.inputSchema)
        ),
      ])
    )
  );
  const [mppCredentials, setMppCredentials] = useState<Record<string, string>>(
    {}
  );
  const streamCancelRef = useRef<(() => void) | null>(null);
  const taskAccessRef = useRef<Record<string, TaskAccess>>({});
  const taskPollRef = useRef<number | null>(null);

  const selected = useMemo(
    () => service.offerings.find(offering => offering.key === selectedKey),
    [selectedKey, service.offerings]
  );

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('offering');
    if (key && service.offerings.some(offering => offering.key === key)) {
      setSelectedKey(key);
      setShowMobileList(false);
    } else if (window.matchMedia('(max-width: 767px)').matches) {
      setShowMobileList(true);
    }
  }, [service.offerings]);

  useEffect(() => {
    return () => {
      streamCancelRef.current?.();
      if (taskPollRef.current !== null)
        window.clearTimeout(taskPollRef.current);
    };
  }, []);

  const selectOffering = useCallback((key: string) => {
    setSelectedKey(key);
    setShowMobileList(false);
    const url = new URL(window.location.href);
    url.searchParams.set('offering', key);
    window.history.pushState({}, '', url);
    window.setTimeout(
      () => document.getElementById('offering-title')?.focus(),
      0
    );
  }, []);

  const dispatch = useCallback((key: string, event: InvocationEvent) => {
    setInvocations(current => ({
      ...current,
      [key]: invocationReducer(current[key] ?? createInvocationState(), event),
    }));
  }, []);

  const requestOptions = useCallback(
    (offering: ServicePageOffering) => ({
      walletClient,
      solanaWallet,
      network: offering.payment.network,
      siwxNetwork: offering.authorization?.siwx.network,
      useSIWx: offering.authorization?.siwx.enabled === true,
      useX402: offering.payment.protocol === 'x402',
      mppCredential: mppCredentials[offering.key],
    }),
    [mppCredentials, solanaWallet, walletClient]
  );

  const parsedPayload = useCallback(
    (offering: ServicePageOffering): unknown | undefined => {
      const state = invocations[offering.key];
      try {
        return JSON.parse(state?.payload ?? '{}');
      } catch {
        dispatch(offering.key, {
          type: 'INVALID',
          error: 'Payload must be valid JSON.',
        });
        return undefined;
      }
    },
    [dispatch, invocations]
  );

  const prepare = useCallback(
    (offering: ServicePageOffering): boolean => {
      dispatch(offering.key, { type: 'PREPARE' });
      if (offering.authorization?.siwx.enabled) {
        const network = offering.authorization.siwx.network;
        if (network?.startsWith('solana:')) {
          dispatch(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: `This storefront cannot sign SIWX challenges for ${network}.`,
          });
          return false;
        }
        if (!walletClient) {
          dispatch(offering.key, { type: 'REQUIRE_AUTHORIZATION' });
          return false;
        }
        const mismatch = paymentNetworkMismatch(network, {
          evmChainId: walletClient.chain?.id,
        });
        if (mismatch) {
          dispatch(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: mismatch,
          });
          return false;
        }
      }
      if (offering.payment.protocol === 'x402') {
        const network = offering.payment.network;
        const usesSolana = network?.startsWith('solana:') === true;
        const hasRequiredWallet = usesSolana
          ? Boolean(solanaWallet.address && solanaWallet.provider)
          : Boolean(walletClient);
        if (!hasRequiredWallet) {
          dispatch(offering.key, { type: 'REQUIRE_PAYMENT' });
          return false;
        }
        const mismatch = paymentNetworkMismatch(network, {
          evmChainId: walletClient?.chain?.id,
          solanaNetwork: solanaWallet.network,
        });
        if (mismatch) {
          dispatch(offering.key, {
            type: 'NETWORK_MISMATCH',
            error: mismatch,
          });
          return false;
        }
      }
      if (
        offering.payment.protocol === 'mpp' &&
        !mppCredentials[offering.key]?.trim()
      ) {
        dispatch(offering.key, { type: 'REQUIRE_PAYMENT' });
        return false;
      }
      return true;
    },
    [dispatch, mppCredentials, solanaWallet, walletClient]
  );

  const runInvoke = useCallback(async () => {
    if (!selected) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    dispatch(selected.key, { type: 'START' });
    try {
      const result = await invokeServiceOperation({
        url: selected.operations.invoke.path,
        body: payload,
        request: requestOptions(selected),
      });
      dispatch(selected.key, {
        type: 'SUCCEED',
        result,
        paymentUsed: selected.payment.required,
      });
    } catch (error) {
      dispatch(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [dispatch, parsedPayload, prepare, requestOptions, selected]);

  const runStream = useCallback(async () => {
    if (!selected?.operations.stream) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    streamCancelRef.current?.();
    dispatch(selected.key, { type: 'START' });
    try {
      const stream = await streamServiceOperation({
        url: selected.operations.stream.path,
        body: payload,
        request: requestOptions(selected),
        onChunk: chunk =>
          dispatch(selected.key, { type: 'CHUNK', chunk: chunkText(chunk) }),
        onDone: () =>
          dispatch(selected.key, {
            type: 'SUCCEED',
            result: 'Stream completed.',
            paymentUsed: selected.payment.required,
          }),
        onError: error =>
          dispatch(selected.key, { type: 'FAIL', error: error.message }),
      });
      streamCancelRef.current = stream.cancel;
    } catch (error) {
      dispatch(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [dispatch, parsedPayload, prepare, requestOptions, selected]);

  const runTask = useCallback(async () => {
    if (!selected || !service.endpoints.tasks) return;
    const payload = parsedPayload(selected);
    if (payload === undefined || !prepare(selected)) return;
    dispatch(selected.key, { type: 'START' });
    try {
      const task = await createServiceTask({
        url: service.endpoints.tasks,
        skillId: selected.key,
        input:
          payload && typeof payload === 'object' && 'input' in payload
            ? (payload as { input: unknown }).input
            : payload,
        request: requestOptions(selected),
      });
      taskAccessRef.current[selected.key] = task;
      dispatch(selected.key, {
        type: 'TASK',
        taskId: task.taskId,
        status: task.status,
      });
      const poll = async () => {
        const access = taskAccessRef.current[selected.key];
        if (!access) return;
        try {
          const current = await getServiceTask({
            tasksUrl: service.endpoints.tasks!,
            ...access,
          });
          dispatch(selected.key, {
            type: 'TASK',
            taskId: current.taskId,
            status: current.status,
          });
          if (current.status === 'completed') {
            dispatch(selected.key, {
              type: 'SUCCEED',
              result: current.result,
              paymentUsed: selected.payment.required,
            });
          } else if (current.status === 'failed') {
            dispatch(selected.key, {
              type: 'FAIL',
              error: current.error?.message ?? 'The task failed.',
            });
          } else if (current.status === 'running') {
            taskPollRef.current = window.setTimeout(poll, 1000);
          }
        } catch (error) {
          dispatch(selected.key, {
            type: 'FAIL',
            error: redactInvocationError(error),
          });
        }
      };
      taskPollRef.current = window.setTimeout(poll, 500);
    } catch (error) {
      dispatch(selected.key, {
        type: 'FAIL',
        error: redactInvocationError(error),
      });
    }
  }, [
    dispatch,
    parsedPayload,
    prepare,
    requestOptions,
    selected,
    service.endpoints.tasks,
  ]);

  const cancel = useCallback(async () => {
    if (!selected) return;
    streamCancelRef.current?.();
    streamCancelRef.current = null;
    if (taskPollRef.current !== null) window.clearTimeout(taskPollRef.current);
    const access = taskAccessRef.current[selected.key];
    if (access && service.endpoints.tasks) {
      await cancelServiceTask({
        tasksUrl: service.endpoints.tasks,
        ...access,
      }).catch(() => undefined);
      delete taskAccessRef.current[selected.key];
    }
    dispatch(selected.key, { type: 'CANCEL' });
  }, [dispatch, selected, service.endpoints.tasks]);

  return (
    <main className="service-page">
      <AgentHeader service={service} />
      <div
        className={`service-layout ${selected ? 'has-selection' : ''} ${showMobileList ? 'show-mobile-list' : ''}`}
      >
        <OfferingList
          offerings={service.offerings}
          selectedKey={selected?.key}
          onSelect={selectOffering}
        />
        {selected ? (
          <OfferingWorkspace
            key={selected.key}
            offering={selected}
            state={
              invocations[selected.key] ??
              createInvocationState(
                createServicePayloadExample(selected.inputSchema)
              )
            }
            dispatch={event => dispatch(selected.key, event)}
            service={service}
            mppCredential={mppCredentials[selected.key] ?? ''}
            setMppCredential={value =>
              setMppCredentials(current => ({
                ...current,
                [selected.key]: value,
              }))
            }
            onInvoke={() => void runInvoke()}
            onStream={() => void runStream()}
            onTask={() => void runTask()}
            onCancel={() => void cancel()}
            onBack={() => setShowMobileList(true)}
          />
        ) : (
          <div className="workspace-empty">
            Select an offering to inspect and run it.
          </div>
        )}
      </div>
      <ServiceDetails service={service} manifest={manifest} />
      <footer className="service-footer">
        <span>{service.agent.name}</span>
        <span>Generated with Lucid Agents</span>
      </footer>
    </main>
  );
}
