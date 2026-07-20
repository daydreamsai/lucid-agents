import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

import {
  buildServicePageModel,
  type ServicePageHealthInput,
  type ServicePageOffering,
} from './service-page-model';
import { createServicePayloadExample } from './schema-example';

type LandingPageOptions = {
  manifest: AgentCardWithEntrypoints;
  health?: ServicePageHealthInput;
  faviconDataUrl: string;
  x402ClientExample: string;
};

function examplePayload(offering: ServicePageOffering): string {
  return createServicePayloadExample(offering.inputSchema);
}

function priceLabel(offering: ServicePageOffering): string {
  const invoke = offering.operations.invoke.price;
  const stream = offering.operations.stream?.price;
  if (!invoke && !stream) return 'Free';
  if (invoke && stream && invoke !== stream) {
    return `${invoke} invoke · ${stream} stream`;
  }
  return invoke ?? stream ?? 'Free';
}

function curlSnippet(offering: ServicePageOffering): string {
  return [
    'curl -s -X POST \\',
    `  '${offering.operations.invoke.url}' \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d '${examplePayload(offering).replace(/\n/g, ' ')}'`,
  ].join('\n');
}

const portableClientScript = `
(() => {
  const activeStreams = new Map();
  const layout = document.querySelector('.service-layout');
  const isMobile = () => matchMedia('(max-width: 767px)').matches;

  const selectWorkspace = (id, open = true, moveFocus = true) => {
    document.querySelectorAll('[data-workspace]').forEach(workspace => {
      workspace.hidden = workspace.id !== id;
    });
    document.querySelectorAll('.offering-rail a').forEach(link => {
      const selected = link.getAttribute('href') === '#' + id;
      link.toggleAttribute('aria-current', selected);
    });
    layout?.classList.toggle('is-workspace-open', open);
    if (open && moveFocus) {
      document.querySelector('#' + CSS.escape(id) + ' h2')?.focus();
    }
  };

  const hashWorkspace = location.hash
    ? document.getElementById(location.hash.slice(1))
    : null;
  const initialWorkspace =
    hashWorkspace?.matches('[data-workspace]') === true
      ? hashWorkspace
      : document.querySelector('[data-workspace]');
  if (initialWorkspace) {
    selectWorkspace(
      initialWorkspace.id,
      Boolean(location.hash) || !isMobile(),
      false
    );
  }

  document.querySelectorAll('.offering-rail a').forEach(link => {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href')?.slice(1);
      if (id) {
        event.preventDefault();
        history.pushState({}, '', '#' + id);
        selectWorkspace(id);
      }
    });
  });

  const setState = (workspace, phase, message, output) => {
    const region = workspace.querySelector('[data-run-state]');
    region.dataset.phase = phase;
    region.querySelector('[data-state-label]').textContent = message;
    if (output !== undefined) {
      region.querySelector('[data-output]').textContent = output;
    }
  };

  const responseMessage = async response => {
    const body = await response.json().catch(() => null);
    if (typeof body?.error === 'string') return body.error;
    if (body?.error?.message) return body.error.message;
    if (body?.error?.code) return body.error.code;
    return 'The service returned HTTP ' + response.status + '.';
  };

  const parsePayload = workspace => {
    try {
      return JSON.parse(workspace.querySelector('textarea').value || '{}');
    } catch {
      setState(workspace, 'invalid', 'Check the JSON input.', 'Payload must be valid JSON.');
      return undefined;
    }
  };

  const runInvoke = async (workspace, button) => {
    const payload = parsePayload(workspace);
    if (payload === undefined) return;
    if (button.dataset.protected === 'true') {
      setState(
        workspace,
        'payment',
        'Protocol-aware client required.',
        'Use the integration example with an x402, MPP, or SIWX-capable client.'
      );
      return;
    }
    setState(workspace, 'running', 'Running request.', 'Waiting for the service…');
    try {
      const response = await fetch(button.dataset.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const type = response.headers.get('content-type') || '';
      const result = type.includes('application/json')
        ? JSON.stringify(await response.json(), null, 2)
        : await response.text();
      setState(workspace, 'success', 'Completed.', result || 'No response body.');
    } catch (error) {
      setState(workspace, 'error', 'Request needs attention.', error.message || String(error));
    }
  };

  const runStream = async (workspace, button) => {
    const payload = parsePayload(workspace);
    if (payload === undefined) return;
    if (button.dataset.protected === 'true') {
      setState(
        workspace,
        'payment',
        'Protocol-aware client required.',
        'Use the integration example with an x402, MPP, or SIWX-capable client.'
      );
      return;
    }
    const previous = activeStreams.get(workspace.id);
    previous?.abort();
    const controller = new AbortController();
    activeStreams.set(workspace.id, controller);
    setState(workspace, 'running', 'Receiving stream.', '');
    try {
      const response = await fetch(button.dataset.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(await responseMessage(response));
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let visible = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\\r\\n/g, '\\n');
        const events = buffer.split('\\n\\n');
        buffer = events.pop() || '';
        for (const event of events) {
          const data = event.split('\\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\\n');
          if (!data || data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            visible += chunk.text ?? chunk.delta ?? (chunk.output ? JSON.stringify(chunk.output, null, 2) : '');
          } catch {
            visible += data;
          }
          setState(workspace, 'partial', 'Receiving stream.', visible);
        }
      }
      setState(workspace, 'success', 'Stream completed.', visible || 'No streamed output.');
    } catch (error) {
      if (controller.signal.aborted) {
        setState(workspace, 'cancelled', 'Stream cancelled.', '');
      } else {
        setState(workspace, 'error', 'Stream needs attention.', error.message || String(error));
      }
    } finally {
      activeStreams.delete(workspace.id);
    }
  };

  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const workspace = button.closest('[data-workspace]');
    if (!workspace) return;
    if (button.dataset.action === 'back') {
      layout?.classList.remove('is-workspace-open');
      history.replaceState({}, '', location.pathname + location.search);
      document.querySelector('.offering-rail a[aria-current]')?.focus();
      return;
    }
    if (button.dataset.action === 'invoke') void runInvoke(workspace, button);
    if (button.dataset.action === 'stream') void runStream(workspace, button);
    if (button.dataset.action === 'cancel') {
      activeStreams.get(workspace.id)?.abort();
    }
  });
})();`;

export const renderLandingPage = ({
  manifest,
  health,
  faviconDataUrl,
  x402ClientExample,
}: LandingPageOptions): HtmlEscapedString | Promise<HtmlEscapedString> => {
  const service = buildServicePageModel(manifest, { health });
  const trustSignals = [
    service.trust.registered ? 'Registered identity' : undefined,
    service.trust.signed ? 'Signed Agent Card' : undefined,
    ...service.trust.models,
  ].filter((value): value is string => Boolean(value));
  const capabilities = [
    ...service.payments.map(payment => ({
      name: payment.method,
      detail: payment.detail ?? payment.network,
    })),
    ...service.capabilities.extensions.map(extension => ({
      name: extension.name,
      detail: extension.required ? 'Required' : 'Supported',
    })),
  ];

  return html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0d0c" />
        <link rel="icon" type="image/svg+xml" href="${faviconDataUrl}" />
        <title>${service.agent.name}</title>
        <meta
          name="description"
          content="${service.agent.description ?? 'Agent service'}"
        />
        <style>
          :root {
            color-scheme: dark;
            --canvas: #0b0d0c;
            --surface: #111512;
            --ink: #edf2eb;
            --muted: #8d978f;
            --rule: #29302b;
            --accent: #7ee2a8;
            --accent-ink: #07120c;
            --warning: #e3b965;
            --error: #ff8b82;
            --code: #080a09;
            --mono:
              'IBM Plex Mono', 'SFMono-Regular', 'SF Mono', Menlo, Consolas,
              monospace;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            min-width: 320px;
            background: var(--canvas);
            color: var(--ink);
            font: 16px/1.5 var(--mono);
          }
          button,
          textarea {
            font: inherit;
          }
          a {
            color: var(--accent);
            text-underline-offset: 3px;
          }
          button:focus-visible,
          a:focus-visible,
          textarea:focus-visible,
          summary:focus-visible {
            outline: 3px solid
              color-mix(in srgb, var(--accent) 34%, transparent);
            outline-offset: 2px;
          }
          .service-page {
            width: min(1240px, 100%);
            margin: 0 auto;
            padding: 0 36px;
          }
          .service-header {
            padding: 48px 0 36px;
            border-bottom: 1px solid var(--rule);
          }
          .kicker,
          .section-label {
            color: var(--muted);
            font: 600 12px/1.4 var(--mono);
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .status-dot {
            display: inline-block;
            width: 7px;
            height: 7px;
            margin-right: 7px;
            border-radius: 50%;
            background: var(--muted);
          }
          .status-online {
            background: var(--accent);
          }
          .status-degraded {
            background: var(--warning);
          }
          .status-offline {
            background: var(--error);
          }
          h1 {
            max-width: 920px;
            margin: 12px 0 0;
            font-size: clamp(26px, 3.5vw, 40px);
            font-weight: 600;
            line-height: 1.1;
            letter-spacing: -0.045em;
          }
          .purpose {
            max-width: 720px;
            margin: 18px 0 0;
            color: var(--muted);
            font-size: clamp(15px, 1.5vw, 18px);
            line-height: 1.6;
          }
          .trust-line {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 20px;
            margin: 24px 0 0;
            padding: 0;
            list-style: none;
            color: var(--muted);
            font: 500 12px/1.4 var(--mono);
          }
          .trust-line li::before {
            content: '';
            display: inline-block;
            width: 5px;
            height: 5px;
            margin: 0 8px 2px 0;
            border-radius: 50%;
            background: var(--accent);
          }
          .service-layout {
            display: grid;
            grid-template-columns: 260px minmax(0, 1fr);
            border-bottom: 1px solid var(--rule);
          }
          @media (min-width: 1200px) {
            .service-layout {
              grid-template-columns: 320px minmax(0, 1fr);
            }
          }
          .offering-rail {
            padding: 32px 24px 40px 0;
            border-right: 1px solid var(--rule);
          }
          .offering-rail ul {
            margin: 18px 0 0;
            padding: 0;
            list-style: none;
            border-top: 1px solid var(--rule);
          }
          .offering-rail li {
            border-bottom: 1px solid var(--rule);
          }
          .offering-rail a {
            display: grid;
            gap: 7px;
            min-height: 92px;
            padding: 16px 12px;
            color: inherit;
            text-decoration: none;
          }
          .offering-rail a[aria-current='true'] {
            border-left: 3px solid var(--accent);
            background: var(--surface);
          }
          .offering-rail small {
            color: var(--muted);
          }
          .price {
            color: var(--accent);
            font: 500 12px/1.4 var(--mono);
          }
          .workspaces {
            min-width: 0;
            padding: 32px 0 52px 38px;
          }
          .workspace {
            padding-bottom: 50px;
            scroll-margin-top: 20px;
          }
          .mobile-back {
            display: none;
          }
          .workspace[hidden] {
            display: none;
          }
          .workspace + .workspace {
            padding-top: 42px;
            border-top: 1px solid var(--rule);
          }
          .workspace-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 24px;
          }
          h2 {
            margin: 7px 0 8px;
            font-size: clamp(26px, 3vw, 36px);
            letter-spacing: -0.03em;
          }
          .workspace-header p {
            max-width: 620px;
            margin: 0;
            color: var(--muted);
          }
          .facts {
            display: flex;
            align-items: flex-start;
            align-content: flex-start;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 7px;
          }
          .facts span {
            padding: 6px 8px;
            border: 1px solid var(--rule);
            border-radius: 4px;
            font: 500 12px/1.2 var(--mono);
            white-space: nowrap;
          }
          .input-block {
            margin-top: 28px;
          }
          textarea {
            width: 100%;
            min-height: 190px;
            margin-top: 11px;
            padding: 16px;
            resize: vertical;
            border: 1px solid var(--rule);
            border-radius: 4px;
            background: var(--code);
            color: var(--ink);
            font: 14px/1.65 var(--mono);
          }
          .protected-note {
            margin-top: 18px;
            padding: 18px;
            border: 1px solid var(--rule);
            border-radius: 4px;
            background: var(--surface);
          }
          .protected-note p {
            margin: 5px 0 0;
            color: var(--muted);
            font-size: 14px;
          }
          .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 20px 0;
          }
          .actions button {
            min-height: 44px;
            padding: 10px 18px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 700;
            transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
          }
          .primary {
            border: 1px solid var(--accent);
            background: var(--accent);
            color: var(--accent-ink);
          }
          .secondary {
            border: 1px solid var(--ink);
            background: transparent;
            color: var(--ink);
          }
          .text-action {
            border: 0;
            background: transparent;
            color: var(--error);
          }
          .run-state {
            min-height: 160px;
            padding: 20px;
            border: 1px solid var(--rule);
            border-radius: 4px;
            background: var(--surface);
          }
          .state-heading {
            display: flex;
            align-items: center;
            gap: 9px;
          }
          .state-heading i {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--muted);
          }
          .run-state[data-phase='running'] i,
          .run-state[data-phase='partial'] i,
          .run-state[data-phase='success'] i {
            background: var(--accent);
          }
          .run-state[data-phase='invalid'] i,
          .run-state[data-phase='error'] i {
            background: var(--error);
          }
          .run-state[data-phase='payment'] i {
            background: var(--warning);
          }
          pre {
            overflow: auto;
            margin: 16px 0 0;
            padding: 15px;
            border-radius: 4px;
            background: var(--code);
            font: 13px/1.6 var(--mono);
            white-space: pre-wrap;
            word-break: break-word;
          }
          details {
            margin-top: 18px;
            border-top: 1px solid var(--rule);
          }
          summary {
            min-height: 48px;
            padding-top: 14px;
            cursor: pointer;
            font-weight: 700;
          }
          .service-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 60px;
            padding: 42px 0;
            border-bottom: 1px solid var(--rule);
          }
          .detail-list,
          .capability-list {
            margin: 15px 0 0;
            padding: 0;
            list-style: none;
            border-top: 1px solid var(--rule);
          }
          .detail-list div,
          .capability-list li {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            padding: 13px 0;
            border-bottom: 1px solid var(--rule);
          }
          .detail-list dt,
          .capability-list span {
            color: var(--muted);
          }
          .detail-list dd {
            margin: 0;
          }
          .empty {
            margin-top: 18px;
            padding: 24px;
            border: 1px solid var(--rule);
            color: var(--muted);
          }
          footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 24px 0 40px;
            color: var(--muted);
            font: 12px/1.4 var(--mono);
          }
          .actions button:active,
          .offering-rail a:active {
            transform: scale(0.97);
          }
          @media (hover: hover) and (pointer: fine) {
            .offering-rail a:hover {
              background: var(--surface);
            }
            .actions button:hover {
              transform: translateY(-1px);
            }
          }
          @media (max-width: 767px) {
            .service-page {
              padding: 0 18px;
            }
            .service-layout,
            .service-details {
              display: block;
            }
            .offering-rail {
              padding-right: 0;
              border-right: 0;
              border-bottom: 1px solid var(--rule);
            }
            .workspaces {
              display: none;
              padding-left: 0;
            }
            .service-layout.is-workspace-open .offering-rail {
              display: none;
            }
            .service-layout.is-workspace-open .workspaces {
              display: block;
            }
            .mobile-back {
              display: inline-flex;
              min-height: 44px;
              align-items: center;
              margin-bottom: 20px;
              padding: 8px 0;
              border: 0;
              background: transparent;
              color: var(--accent);
              cursor: pointer;
              font-weight: 700;
            }
            .workspace-header {
              display: block;
            }
            .facts {
              justify-content: flex-start;
              margin-top: 16px;
            }
            .service-details > div + div {
              margin-top: 36px;
            }
          }
          @media (max-width: 480px) {
            .service-page {
              padding: 0 14px;
            }
            .actions {
              position: sticky;
              z-index: 2;
              bottom: 0;
              margin-inline: -14px;
              padding: 12px 14px;
              border-block: 1px solid var(--rule);
              background: color-mix(in srgb, var(--canvas) 94%, transparent);
            }
            .actions .primary {
              flex: 1;
            }
            textarea {
              margin-inline: -14px;
              width: calc(100% + 28px);
              border-inline: 0;
              border-radius: 0;
            }
            footer {
              display: grid;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
              animation-duration: 0.01ms !important;
              transition-duration: 0.01ms !important;
            }
          }
        </style>
      </head>
      <body>
        <main class="service-page">
          <header class="service-header">
            <div class="kicker">
              <span class="status-dot status-${service.status.state}"></span>
              ${service.status.label}${service.agent.version
                ? ` · v${service.agent.version}`
                : ''}
            </div>
            <h1>${service.agent.name}</h1>
            <p class="purpose">
              ${service.agent.description ??
              'This agent has not published a description yet.'}
            </p>
            ${trustSignals.length
              ? html`<ul class="trust-line" aria-label="Trust signals">
                  ${trustSignals.map(signal => html`<li>${signal}</li>`)}
                </ul>`
              : ''}
          </header>

          <div class="service-layout">
            <nav class="offering-rail" aria-label="Agent offerings">
              <div class="section-label">Offerings</div>
              ${service.offerings.length
                ? html`<ul>
                    ${service.offerings.map(
                      offering =>
                        html`<li>
                          <a href="#offering-${offering.key}">
                            <strong>${offering.title}</strong>
                            <small>${offering.description}</small>
                            <span class="price">${priceLabel(offering)}</span>
                          </a>
                        </li>`
                    )}
                  </ul>`
                : html`<div class="empty">
                    <strong>No offerings published</strong><br />Entrypoints
                    will appear here when the service registers them.
                  </div>`}
            </nav>

            <div class="workspaces">
              ${service.offerings.map(offering => {
                const protectedOperation =
                  offering.payment.required ||
                  offering.authorization?.siwx.enabled;
                return html`<article
                  class="workspace"
                  id="offering-${offering.key}"
                  data-workspace
                >
                  <button class="mobile-back" type="button" data-action="back">
                    Back to offerings
                  </button>
                  <header class="workspace-header">
                    <div>
                      <div class="section-label">Offering</div>
                      <h2 tabindex="-1">${offering.title}</h2>
                      <p>${offering.description}</p>
                    </div>
                    <div class="facts">
                      <span>${priceLabel(offering)}</span>
                      ${offering.payment.protocol
                        ? html`<span>${offering.payment.protocol}</span>`
                        : ''}
                      ${offering.payment.network
                        ? html`<span>${offering.payment.network}</span>`
                        : ''}
                    </div>
                  </header>
                  <div class="input-block">
                    <label class="section-label" for="payload-${offering.key}"
                      >Input JSON</label
                    >
                    <textarea id="payload-${offering.key}" spellcheck="false">
${examplePayload(offering)}</textarea
                    >
                  </div>
                  ${protectedOperation
                    ? html`<div class="protected-note">
                        <strong>Protected operation</strong>
                        <p>
                          Use a protocol-aware client to complete
                          ${offering.authorization?.siwx.enabled
                            ? 'wallet authorization'
                            : (offering.payment.protocol ?? 'payment')}.
                          This portable page does not request credentials.
                        </p>
                      </div>`
                    : ''}
                  <div class="actions">
                    <button
                      class="primary"
                      type="button"
                      data-action="invoke"
                      data-protected="${String(Boolean(protectedOperation))}"
                      data-url="${offering.operations.invoke.path}"
                    >
                      Invoke
                    </button>
                    ${offering.operations.stream
                      ? html`<button
                            class="secondary"
                            type="button"
                            data-action="stream"
                            data-protected="${String(
                              Boolean(protectedOperation)
                            )}"
                            data-url="${offering.operations.stream.path}"
                          >
                            Stream
                          </button>
                          <button
                            class="text-action"
                            type="button"
                            data-action="cancel"
                          >
                            Cancel stream
                          </button>`
                      : ''}
                  </div>
                  <section
                    class="run-state"
                    data-run-state
                    data-phase="ready"
                    aria-live="polite"
                  >
                    <div class="state-heading">
                      <i aria-hidden="true"></i>
                      <strong data-state-label>Ready to run.</strong>
                    </div>
                    <pre data-output>
Results and streaming output will appear here.</pre
                    >
                  </section>
                  <details>
                    <summary>Integration details</summary>
                    <p>
                      <code>POST ${offering.operations.invoke.path}</code>
                    </p>
                    <pre>${curlSnippet(offering)}</pre>
                    ${offering.outputSchema
                      ? html`<p class="section-label">Output schema</p>
                          <pre>
${JSON.stringify(offering.outputSchema, null, 2)}</pre
                          >`
                      : ''}
                  </details>
                </article>`;
              })}
            </div>
          </div>

          <section class="service-details" aria-label="Service details">
            <div>
              <div class="section-label">Service endpoints</div>
              <dl class="detail-list">
                <div>
                  <dt>Agent Card</dt>
                  <dd>
                    <a href="${service.endpoints.agentCard}">Open JSON</a>
                  </dd>
                </div>
                <div>
                  <dt>Health</dt>
                  <dd>
                    <a href="${service.endpoints.health}">Check status</a>
                  </dd>
                </div>
                <div>
                  <dt>A2A tasks</dt>
                  <dd>
                    ${service.endpoints.tasks ? 'Available' : 'Not published'}
                  </dd>
                </div>
              </dl>
            </div>
            <div>
              <div class="section-label">Public capabilities</div>
              ${capabilities.length
                ? html`<ul class="capability-list">
                    ${capabilities.map(
                      capability =>
                        html`<li>
                          <strong>${capability.name}</strong>
                          <span>${capability.detail}</span>
                        </li>`
                    )}
                  </ul>`
                : html`<div class="empty">
                    No additional capabilities published.
                  </div>`}
              ${service.payments.some(payment => payment.method === 'x402')
                ? html`<details>
                    <summary>x402 client example</summary>
                    <pre>${x402ClientExample}</pre>
                  </details>`
                : ''}
            </div>
          </section>
          <footer>
            <span>${service.agent.name}</span>
            <span>Generated with Lucid Agents</span>
          </footer>
        </main>
        <script>
          ${raw(portableClientScript)};
        </script>
      </body>
    </html>`;
};
