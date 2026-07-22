'use client';

import {
  createServicePayloadExample,
  type ServicePageModel,
  type ServicePageOffering,
} from '@lucid-agents/http';
import {
  createServiceUiStyleSheet,
  resolveServiceUi,
} from '@lucid-agents/http/service-ui';
import type { ServiceUiConfig } from '@lucid-agents/types/http';
import { useMemo, useState } from 'react';

import { WalletSummary } from '@/components/wallet-summary';
import { useServiceStorefront } from '@/hooks/use-service-storefront';
import type { InvocationEvent, InvocationState } from '@/lib/invocation-state';
import {
  endpointPathLabel,
  formatServiceValue,
  integrationSnippet,
  offeringPriceLabel,
  visibleOfferingTags,
} from '@/lib/service-utils';

export type ServiceStorefrontProps = {
  service: ServicePageModel;
  manifest: unknown;
  serviceUi?: ServiceUiConfig;
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

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}

function safePublicHref(value: string): string | undefined {
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) {
    return value;
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    ) {
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function PublicLink({ value, label }: { value: string; label?: string }) {
  const href = safePublicHref(value);
  return href ? (
    <a href={href}>{label ?? value}</a>
  ) : (
    <code>{label ?? value}</code>
  );
}

function AgentHeader({ service }: { service: ServicePageModel }) {
  const trustSignals = [
    service.trust.registered ? 'Registered identity' : null,
    service.trust.signed ? 'Signed Agent Card' : null,
    ...service.trust.models,
  ].filter((value): value is string => Boolean(value));
  const provider = service.agent.provider;
  return (
    <header className="service-header" data-region="identity">
      <div className="service-kicker">
        <span
          className={`status-dot status-${service.status.state}`}
          aria-hidden="true"
        />
        {service.status.label}
        {service.agent.version ? ` · v${service.agent.version}` : ''}
      </div>
      <h1>{service.agent.name}</h1>
      <p className="service-purpose">
        {service.agent.description ??
          'This agent has not published a description yet.'}
      </p>
      {provider || service.agent.documentationUrl ? (
        <ul className="identity-meta" aria-label="Service ownership">
          {provider?.organization ? (
            <li>
              {provider.url ? (
                <PublicLink
                  value={provider.url}
                  label={provider.organization}
                />
              ) : (
                provider.organization
              )}
            </li>
          ) : null}
          {service.agent.documentationUrl ? (
            <li>
              <PublicLink value={service.agent.documentationUrl} />
            </li>
          ) : null}
        </ul>
      ) : null}
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
    <nav
      className="offering-rail"
      data-region="offerings"
      aria-label="Agent offerings"
    >
      <div className="section-label">Agent offerings</div>
      {offerings.length === 0 ? (
        <div className="empty-state">
          <strong>No offerings published</strong>
          <p>Entrypoints will appear here when the service registers them.</p>
        </div>
      ) : (
        <ul className="offering-list">
          {offerings.map(offering => {
            const selected = offering.key === selectedKey;
            return (
              <li key={offering.key} className={selected ? 'is-selected' : ''}>
                <button
                  type="button"
                  aria-current={selected ? 'page' : undefined}
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
            );
          })}
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
    await navigator.clipboard.writeText(pretty(manifest));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const endpoints = [
    ['Agent Card', service.endpoints.agentCard],
    ['Health', service.endpoints.health],
    ['Entrypoints', service.endpoints.entrypoints],
    ['A2A tasks', service.endpoints.tasks],
    ['Validation requests', service.endpoints.validationRequests],
    ['Validation responses', service.endpoints.validationResponses],
    ['Feedback data', service.endpoints.feedback],
  ] as const;
  const capabilityRows = [
    ['Streaming', service.capabilities.streaming],
    ['A2A tasks', service.capabilities.tasks],
    ['Push notifications', service.capabilities.pushNotifications],
    [
      'Authenticated extended card',
      service.capabilities.authenticatedExtendedCard,
    ],
  ] as const;

  return (
    <>
      <section
        className="service-details"
        data-region="service-details"
        aria-labelledby="service-details-title"
      >
        <div className="section-label" id="service-details-title">
          Public service contract
        </div>

        <article className="detail-card">
          <h3>Endpoints</h3>
          <dl className="detail-list">
            {endpoints.map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <PublicLink
                      value={value}
                      label={endpointPathLabel(value)}
                    />
                  </dd>
                </div>
              ) : null
            )}
          </dl>
        </article>

        <article className="detail-card">
          <h3>Capabilities</h3>
          <ul className="capability-list">
            {capabilityRows.map(([label, supported]) => (
              <li key={label}>
                <strong>{label}</strong>
                <span>{supported ? 'Supported' : 'Not supported'}</span>
              </li>
            ))}
            {service.capabilities.extensions.map(extension => (
              <li key={extension.uri ?? extension.name}>
                <strong>{extension.name}</strong>
                <span>
                  {extension.required ? 'Required' : 'Supported'}
                  {extension.uri ? (
                    <>
                      {' · '}
                      <PublicLink value={extension.uri} label="Specification" />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </article>

        {service.protocol.version ||
        service.protocol.interfaces.length ||
        service.protocol.defaultInputModes.length ||
        service.protocol.defaultOutputModes.length ? (
          <article className="detail-card">
            <h3>Protocol and interfaces</h3>
            <dl className="detail-list">
              {service.protocol.version ? (
                <div>
                  <dt>Protocol version</dt>
                  <dd>{service.protocol.version}</dd>
                </div>
              ) : null}
              {service.protocol.interfaces.map(supportedInterface => (
                <div
                  key={`${supportedInterface.protocolBinding}-${supportedInterface.url}`}
                >
                  <dt>
                    {supportedInterface.protocolBinding}
                    {supportedInterface.preferred ? ' · preferred' : ''}
                  </dt>
                  <dd>
                    <PublicLink value={supportedInterface.url} />
                  </dd>
                </div>
              ))}
              {service.protocol.defaultInputModes.length ? (
                <div>
                  <dt>Default input modes</dt>
                  <dd>{service.protocol.defaultInputModes.join(', ')}</dd>
                </div>
              ) : null}
              {service.protocol.defaultOutputModes.length ? (
                <div>
                  <dt>Default output modes</dt>
                  <dd>{service.protocol.defaultOutputModes.join(', ')}</dd>
                </div>
              ) : null}
            </dl>
          </article>
        ) : null}

        {service.security.schemes.length ||
        service.security.requirements.length ? (
          <article className="detail-card">
            <h3>Security</h3>
            {service.security.schemes.length ? (
              <ul className="capability-list">
                {service.security.schemes.map(scheme => (
                  <li key={scheme.name}>
                    <strong>{scheme.name}</strong>
                    <span>
                      <code>{pretty(scheme.definition)}</code>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {service.security.requirements.length ? (
              <>
                <div className="code-caption">Requirements</div>
                <pre>{pretty(service.security.requirements)}</pre>
              </>
            ) : null}
          </article>
        ) : null}

        {service.payments.length ? (
          <article className="detail-card">
            <h3>Payments</h3>
            <ul className="capability-list">
              {service.payments.map(payment => (
                <li key={`${payment.method}-${payment.network}`}>
                  <strong>{payment.method}</strong>
                  <span>
                    {payment.network}
                    {payment.detail ? ` · ${payment.detail}` : ''}
                    {payment.defaultPrice ? ` · ${payment.defaultPrice}` : ''}
                    {payment.payee ? (
                      <>
                        <br />
                        <code>{payment.payee}</code>
                      </>
                    ) : null}
                    {payment.endpoint ? (
                      <>
                        <br />
                        <PublicLink value={payment.endpoint} />
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        <article className="detail-card">
          <h3>Trust</h3>
          <dl className="detail-list">
            <div>
              <dt>Registration</dt>
              <dd>
                {service.trust.registered
                  ? `${service.trust.registrations.length} registration${service.trust.registrations.length === 1 ? '' : 's'}`
                  : 'Not registered'}
              </dd>
            </div>
            <div>
              <dt>Agent Card signature</dt>
              <dd>{service.trust.signed ? 'Signed' : 'Not signed'}</dd>
            </div>
            {service.trust.models.length ? (
              <div>
                <dt>Trust models</dt>
                <dd>{service.trust.models.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
          {service.trust.registrations.length ? (
            <pre>{pretty(service.trust.registrations)}</pre>
          ) : null}
        </article>

        {service.skills.length ? (
          <article className="detail-card">
            <h3>Published skills</h3>
            <ul className="capability-list">
              {service.skills.map(skill => (
                <li key={skill.id}>
                  <strong>{skill.name ?? skill.id}</strong>
                  <span>
                    {skill.description ?? ''}
                    {skill.tags?.length ? (
                      <>
                        <br />
                        {skill.tags.join(', ')}
                      </>
                    ) : null}
                    {skill.examples?.length ? (
                      <>
                        <br />
                        {skill.examples.join(' · ')}
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </section>

      <section className="raw-card" data-region="raw-card">
        <div className="section-heading-row">
          <div className="section-label">Public Agent Card JSON</div>
          <button className="text-button" type="button" onClick={copyManifest}>
            {copied ? 'Agent Card copied' : 'Copy Agent Card'}
          </button>
        </div>
        <details>
          <summary>View the complete public contract</summary>
          <pre>{pretty(manifest)}</pre>
        </details>
      </section>
    </>
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
  const tags = visibleOfferingTags(
    offering.tags,
    offering.payment.protocol,
    offering.payment.network
  );
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
    <article
      className="offering-workspace"
      data-region="operation"
      aria-labelledby="offering-title"
    >
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
          {tags.length ? (
            <ul className="tag-list" aria-label="Offering tags">
              {tags.map(tag => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
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
          aria-label={`${showIntegration ? 'Hide' : 'Show'} integration details`}
          onClick={() => setShowIntegration(value => !value)}
        >
          Integration details
          <span>{showIntegration ? 'Hide' : 'Show'}</span>
        </button>
        {showIntegration ? (
          <div className="integration-body">
            <div className="endpoint-line">
              <span>{offering.operations.invoke.method}</span>
              <code>{offering.operations.invoke.path}</code>
            </div>
            <pre>{snippet}</pre>
            <button className="text-button" type="button" onClick={copySnippet}>
              {copied ? 'cURL copied' : 'Copy cURL'}
            </button>
            <div className="schema-grid">
              <details>
                <summary>Input schema</summary>
                <pre>{pretty(offering.inputSchema ?? { type: 'object' })}</pre>
              </details>
              <details>
                <summary>Output schema</summary>
                <pre>{pretty(offering.outputSchema ?? { type: 'object' })}</pre>
              </details>
            </div>
            {offering.inputModes?.length || offering.outputModes?.length ? (
              <ul className="mode-list" aria-label="Content modes">
                {offering.inputModes?.map(mode => (
                  <li key={`input-${mode}`}>In: {mode}</li>
                ))}
                {offering.outputModes?.map(mode => (
                  <li key={`output-${mode}`}>Out: {mode}</li>
                ))}
              </ul>
            ) : null}
            {offering.examples?.length ? (
              <details>
                <summary>Published examples</summary>
                <ul className="example-list">
                  {offering.examples.map(example => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {offering.security?.length ? (
              <details>
                <summary>Skill security</summary>
                <pre>{pretty(offering.security)}</pre>
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
  serviceUi,
}: ServiceStorefrontProps) {
  const controller = useServiceStorefront(service);
  const resolvedUi = useMemo(() => resolveServiceUi(serviceUi), [serviceUi]);
  const styleSheet = useMemo(
    () => createServiceUiStyleSheet(resolvedUi),
    [resolvedUi]
  );

  return (
    <>
      {resolvedUi.tokens.fonts.stylesheetUrl ? (
        <link
          rel="stylesheet"
          href={resolvedUi.tokens.fonts.stylesheetUrl}
          data-service-ui-fonts
        />
      ) : null}
      <style data-service-ui-styles>{styleSheet}</style>
      <main
        className="service-page"
        data-service-ui-preset={resolvedUi.preset}
        data-service-ui-mode="interactive"
      >
        <AgentHeader service={service} />
        <div
          className={`service-layout ${controller.selected ? 'has-selection' : ''} ${controller.showMobileList ? 'show-mobile-list' : ''}`}
        >
          <OfferingList
            offerings={service.offerings}
            selectedKey={controller.selected?.key}
            onSelect={controller.selectOffering}
          />
          {controller.selected && controller.state ? (
            <OfferingWorkspace
              key={controller.selected.key}
              offering={controller.selected}
              state={controller.state}
              dispatch={controller.dispatch}
              service={service}
              mppCredential={controller.mppCredential}
              setMppCredential={controller.setMppCredential}
              onInvoke={() => void controller.invoke()}
              onStream={() => void controller.stream()}
              onTask={() => void controller.task()}
              onCancel={() => void controller.cancel()}
              onBack={controller.showOfferingList}
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
    </>
  );
}
