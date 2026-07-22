import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { ServiceUiConfig } from '@lucid-agents/types/http';
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

import { createServicePayloadExample } from './schema-example';
import {
  buildServicePageModel,
  type ServicePageHealthInput,
  type ServicePageOffering,
} from './service-page-model';
import { createServiceUiStyleSheet, resolveServiceUi } from './service-ui';

type LandingPageOptions = {
  manifest: AgentCardWithEntrypoints;
  health?: ServicePageHealthInput;
  faviconDataUrl: string;
  x402ClientExample: string;
  serviceUi?: ServiceUiConfig;
};

type HtmlTemplate = ReturnType<typeof html>;

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

function endpointPathLabel(value: string): string {
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || value;
  } catch {
    return value;
  }
}

const FACT_TAGS = new Set(['free', 'paid', 'invoke', 'stream']);

function visibleTags(offering: ServicePageOffering): string[] {
  const facts = new Set(FACT_TAGS);
  if (offering.payment.protocol) {
    facts.add(offering.payment.protocol.toLowerCase());
  }
  if (offering.payment.network) {
    facts.add(offering.payment.network.toLowerCase());
  }
  return (offering.tags ?? []).filter(
    tag => !facts.has(tag.trim().toLowerCase())
  );
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

function curlSnippet(offering: ServicePageOffering): string {
  return [
    `curl -s -X ${offering.operations.invoke.method} \\`,
    `  ${shellQuote(offering.operations.invoke.url)} \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -d ${shellQuote(examplePayload(offering).replace(/\n/gu, ' '))}`,
  ].join('\n');
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

function linkOrText(value: string, label?: string): HtmlTemplate {
  const href = safePublicHref(value);
  return href
    ? html`<a href="${href}">${label ?? value}</a>`
    : html`<code>${label ?? value}</code>`;
}

function endpointRows(
  endpoints: Record<string, string | undefined>
): HtmlTemplate[] {
  const labels: Record<string, string> = {
    agentCard: 'Agent Card',
    health: 'Health',
    entrypoints: 'Entrypoints',
    tasks: 'A2A tasks',
    validationRequests: 'Validation requests',
    validationResponses: 'Validation responses',
    feedback: 'Feedback data',
  };
  return Object.entries(endpoints)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(
      ([key, value]) =>
        html`<div>
          <dt>${labels[key] ?? key}</dt>
          <dd>${linkOrText(value, endpointPathLabel(value))}</dd>
        </div>`
    );
}

function capabilityRows(
  capabilities: ReturnType<typeof buildServicePageModel>['capabilities']
): HtmlTemplate[] {
  const rows = [
    ['Streaming', capabilities.streaming],
    ['A2A tasks', capabilities.tasks],
    ['Push notifications', capabilities.pushNotifications],
    ['Authenticated extended card', capabilities.authenticatedExtendedCard],
  ] as const;
  return [
    ...rows.map(
      ([name, supported]) =>
        html`<li>
          <strong>${name}</strong>
          <span>${supported ? 'Supported' : 'Not supported'}</span>
        </li>`
    ),
    ...capabilities.extensions.map(
      extension =>
        html`<li>
          <strong>${extension.name}</strong>
          <span>
            ${extension.required ? 'Required' : 'Supported'}
            ${extension.uri
              ? html` · ${linkOrText(extension.uri, 'Specification')}`
              : ''}
          </span>
        </li>`
    ),
  ];
}

function offeringArticle(
  offering: ServicePageOffering,
  index: number
): HtmlTemplate {
  const protectedOperation =
    offering.payment.required || offering.authorization?.siwx.enabled === true;
  const tags = visibleTags(offering);
  return html`<article
    class="workspace offering-workspace"
    id="offering-${offering.key}"
    data-region="operation"
  >
    <header class="workspace-header">
      <div>
        <div class="section-label">Offering ${index + 1}</div>
        <h2>${offering.title}</h2>
        <p>${offering.description}</p>
        ${tags.length
          ? html`<ul class="tag-list" aria-label="Offering tags">
              ${tags.map(tag => html`<li>${tag}</li>`)}
            </ul>`
          : ''}
      </div>
      <div class="facts" aria-label="Operation facts">
        <span>${priceLabel(offering)}</span>
        ${offering.payment.protocol
          ? html`<span>${offering.payment.protocol}</span>`
          : ''}
        ${offering.payment.network
          ? html`<span>${offering.payment.network}</span>`
          : ''}
      </div>
    </header>

    ${protectedOperation
      ? html`<aside class="protected-note">
          <strong>Protected operation</strong>
          <p>
            Use a protocol-aware client to complete
            ${offering.authorization?.siwx.enabled
              ? 'wallet authorization'
              : (offering.payment.protocol ?? 'payment')}.
            This read-only page never requests credentials or submits API calls.
          </p>
        </aside>`
      : ''}

    <div class="contract-grid">
      <section class="request-contract contract-block">
        <div class="section-label">Request</div>
        <p>
          <code
            >${offering.operations.invoke.method}
            ${offering.operations.invoke.path}</code
          >
        </p>
        <pre>${examplePayload(offering)}</pre>
        <div class="code-caption">cURL</div>
        <pre>${curlSnippet(offering)}</pre>
        <div class="code-caption">Input schema</div>
        <pre>${pretty(offering.inputSchema ?? { type: 'object' })}</pre>
      </section>

      <section class="contract-output contract-block">
        <div class="section-label">Response</div>
        <pre>${pretty(offering.outputSchema ?? { type: 'object' })}</pre>
        ${offering.operations.stream
          ? html`<p>
              <code
                >${offering.operations.stream.method}
                ${offering.operations.stream.path}</code
              >
            </p>`
          : ''}
        ${offering.inputModes?.length || offering.outputModes?.length
          ? html`<div class="code-caption">Content modes</div>
              <ul class="mode-list">
                ${offering.inputModes?.map(mode => html`<li>In: ${mode}</li>`)}
                ${offering.outputModes?.map(
                  mode => html`<li>Out: ${mode}</li>`
                )}
              </ul>`
          : ''}
        ${offering.examples?.length
          ? html`<div class="code-caption">Examples</div>
              <ul class="example-list">
                ${offering.examples.map(example => html`<li>${example}</li>`)}
              </ul>`
          : ''}
        ${offering.security?.length
          ? html`<div class="code-caption">Skill security</div>
              <pre>${pretty(offering.security)}</pre>`
          : ''}
      </section>
    </div>
  </article>`;
}

/** Renders the portable, read-only public storefront used by server adapters. */
export async function renderLandingPage({
  manifest,
  health,
  faviconDataUrl,
  x402ClientExample,
  serviceUi,
}: LandingPageOptions): Promise<HtmlEscapedString> {
  const service = buildServicePageModel(manifest, { health });
  const resolvedUi = resolveServiceUi(serviceUi);
  const styleSheet = createServiceUiStyleSheet(resolvedUi);
  const description =
    service.agent.description ??
    'This agent has not published a description yet.';
  const trustSignals = [
    ...(service.trust.registered ? ['Registered identity'] : []),
    ...(service.trust.signed ? ['Signed Agent Card'] : []),
    ...service.trust.models,
  ];
  const fontStylesheet = resolvedUi.tokens.fonts.stylesheetUrl;
  const provider = service.agent.provider;

  return await html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="theme-color"
          content="${resolvedUi.tokens.colors.canvas.toLowerCase()}"
        />
        <link rel="icon" type="image/svg+xml" href="${faviconDataUrl}" />
        ${fontStylesheet
          ? html`<link rel="stylesheet" href="${fontStylesheet}" />`
          : ''}
        <title>${service.agent.name}</title>
        <meta name="description" content="${description}" />
        <style>
          ${raw(styleSheet)}
        </style>
      </head>
      <body>
        <main
          class="service-page"
          data-service-ui-preset="${resolvedUi.preset}"
          data-service-ui-mode="static"
        >
          <header class="service-header" data-region="identity">
            <div class="kicker">
              <span
                class="status-dot status-${service.status.state}"
                aria-hidden="true"
              ></span>
              ${service.status.label}
              ${service.agent.version ? ` · v${service.agent.version}` : ''}
            </div>
            <h1>${service.agent.name}</h1>
            <p class="purpose">${description}</p>
            ${provider || service.agent.documentationUrl
              ? html`<ul class="identity-meta" aria-label="Service ownership">
                  ${provider?.organization
                    ? html`<li>
                        ${provider.url
                          ? linkOrText(provider.url, provider.organization)
                          : provider.organization}
                      </li>`
                    : ''}
                  ${service.agent.documentationUrl
                    ? html`<li>
                        ${linkOrText(
                          service.agent.documentationUrl,
                          service.agent.documentationUrl
                        )}
                      </li>`
                    : ''}
                </ul>`
              : ''}
            ${trustSignals.length
              ? html`<ul class="trust-line" aria-label="Trust signals">
                  ${trustSignals.map(signal => html`<li>${signal}</li>`)}
                </ul>`
              : ''}
          </header>

          <div class="service-layout">
            <nav
              class="offering-rail"
              data-region="offerings"
              aria-label="Agent offerings"
            >
              <div class="section-label">Agent offerings</div>
              ${service.offerings.length
                ? html`<ul class="offering-list">
                    ${service.offerings.map(
                      offering =>
                        html`<li>
                          <a href="#offering-${offering.key}">
                            <span class="offering-title"
                              >${offering.title}</span
                            >
                            <span class="offering-description"
                              >${offering.description}</span
                            >
                            <span class="offering-meta"
                              >${priceLabel(offering)}</span
                            >
                          </a>
                        </li>`
                    )}
                  </ul>`
                : html`<div class="empty-state">
                    <strong>No offerings published</strong>
                    <p>
                      Entrypoints will appear here when the service registers
                      them.
                    </p>
                  </div>`}
            </nav>

            <section class="workspaces" aria-label="Offering contracts">
              ${service.offerings.map(offeringArticle)}
            </section>
          </div>

          <section
            class="service-details"
            data-region="service-details"
            aria-labelledby="service-details-title"
          >
            <div class="section-label" id="service-details-title">
              Public service contract
            </div>

            <article class="detail-card">
              <h3>Endpoints</h3>
              <dl class="detail-list">${endpointRows(service.endpoints)}</dl>
            </article>

            <article class="detail-card">
              <h3>Capabilities</h3>
              <ul class="capability-list">
                ${capabilityRows(service.capabilities)}
              </ul>
            </article>

            ${service.protocol.version ||
            service.protocol.interfaces.length ||
            service.protocol.defaultInputModes.length ||
            service.protocol.defaultOutputModes.length
              ? html`<article class="detail-card">
                  <h3>Protocol and interfaces</h3>
                  <dl class="detail-list">
                    ${service.protocol.version
                      ? html`<div>
                          <dt>Protocol version</dt>
                          <dd>${service.protocol.version}</dd>
                        </div>`
                      : ''}
                    ${service.protocol.interfaces.map(
                      supportedInterface =>
                        html`<div>
                          <dt>
                            ${supportedInterface.protocolBinding}${supportedInterface.preferred
                              ? ' · preferred'
                              : ''}
                          </dt>
                          <dd>${linkOrText(supportedInterface.url)}</dd>
                        </div>`
                    )}
                    ${service.protocol.defaultInputModes.length
                      ? html`<div>
                          <dt>Default input modes</dt>
                          <dd>
                            ${service.protocol.defaultInputModes.join(', ')}
                          </dd>
                        </div>`
                      : ''}
                    ${service.protocol.defaultOutputModes.length
                      ? html`<div>
                          <dt>Default output modes</dt>
                          <dd>
                            ${service.protocol.defaultOutputModes.join(', ')}
                          </dd>
                        </div>`
                      : ''}
                  </dl>
                </article>`
              : ''}
            ${service.security.schemes.length ||
            service.security.requirements.length
              ? html`<article class="detail-card">
                  <h3>Security</h3>
                  ${service.security.schemes.length
                    ? html`<ul class="capability-list">
                        ${service.security.schemes.map(
                          scheme =>
                            html`<li>
                              <strong>${scheme.name}</strong>
                              <span>
                                <code>${pretty(scheme.definition)}</code>
                              </span>
                            </li>`
                        )}
                      </ul>`
                    : ''}
                  ${service.security.requirements.length
                    ? html`<div class="code-caption">Requirements</div>
                        <pre>${pretty(service.security.requirements)}</pre>`
                    : ''}
                </article>`
              : ''}
            ${service.payments.length
              ? html`<article class="detail-card">
                  <h3>Payments</h3>
                  <ul class="capability-list">
                    ${service.payments.map(
                      payment =>
                        html`<li>
                          <strong>${payment.method}</strong>
                          <span>
                            ${payment.network}${payment.detail
                              ? ` · ${payment.detail}`
                              : ''}${payment.defaultPrice
                              ? ` · ${payment.defaultPrice}`
                              : ''}
                            ${payment.payee
                              ? html`<br /><code>${payment.payee}</code>`
                              : ''}
                            ${payment.endpoint
                              ? html`<br />${linkOrText(payment.endpoint)}`
                              : ''}
                          </span>
                        </li>`
                    )}
                  </ul>
                  ${service.payments.some(payment => payment.method === 'x402')
                    ? html`<details>
                        <summary>x402 client example</summary>
                        <pre>${x402ClientExample}</pre>
                      </details>`
                    : ''}
                </article>`
              : ''}

            <article class="detail-card">
              <h3>Trust</h3>
              <dl class="detail-list">
                <div>
                  <dt>Registration</dt>
                  <dd>
                    ${service.trust.registered
                      ? 'Registered identity'
                      : 'Not registered'}
                  </dd>
                </div>
                <div>
                  <dt>Agent Card signature</dt>
                  <dd>${service.trust.signed ? 'Signed' : 'Not signed'}</dd>
                </div>
                ${service.trust.models.length
                  ? html`<div>
                      <dt>Trust models</dt>
                      <dd>${service.trust.models.join(', ')}</dd>
                    </div>`
                  : ''}
              </dl>
              ${service.trust.registrations.length
                ? html`<pre>${pretty(service.trust.registrations)}</pre>`
                : ''}
            </article>

            ${service.skills.length
              ? html`<article class="detail-card">
                  <h3>Published skills</h3>
                  <ul class="capability-list">
                    ${service.skills.map(
                      skill =>
                        html`<li>
                          <strong>${skill.name ?? skill.id}</strong>
                          <span>
                            ${skill.description ?? ''}
                            ${skill.tags?.length
                              ? html`<br />${skill.tags.join(', ')}`
                              : ''}
                            ${skill.examples?.length
                              ? html`<br />${skill.examples.join(' · ')}`
                              : ''}
                          </span>
                        </li>`
                    )}
                  </ul>
                </article>`
              : ''}
          </section>

          <section class="raw-card" data-region="raw-card">
            <div class="section-label">Public Agent Card JSON</div>
            <details>
              <summary>View the complete public contract</summary>
              <pre>${pretty(manifest)}</pre>
            </details>
          </section>

          <footer class="service-footer">
            <span>${service.agent.name}</span>
            <span>Generated with Lucid Agents</span>
          </footer>
        </main>
      </body>
    </html>`;
}
