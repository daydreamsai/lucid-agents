import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { ServiceUiConfig } from '@lucid-agents/types/http';
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

import {
  buildServicePageModel,
  type ServicePageHealthInput,
  type ServicePageOffering,
  type ServicePageOperation,
} from './service-page-model';
import { createServiceUiStyleSheet, resolveServiceUi } from './service-ui';

type LandingPageOptions = {
  manifest: AgentCardWithEntrypoints;
  health?: ServicePageHealthInput;
  faviconDataUrl: string;
  /** Retained for compatibility with existing adapter integrations. */
  x402ClientExample: string;
  serviceUi?: ServiceUiConfig;
};

type EndpointRow = {
  key: string;
  title: string;
  description: string;
  operation: ServicePageOperation;
  paymentMethod: string;
  paymentNetwork?: string;
};

function endpointRows(offerings: ServicePageOffering[]): EndpointRow[] {
  return offerings.flatMap(offering => {
    const operationRow = (
      kind: 'invoke' | 'stream',
      operation: ServicePageOperation
    ): EndpointRow => ({
      key: `${offering.key}-${kind}`,
      title: `${offering.title}${kind === 'stream' ? ' stream' : ''}`,
      description: offering.description,
      operation,
      paymentMethod: operation.price
        ? (offering.payment.protocol ?? 'Required')
        : 'None',
      ...(operation.price && offering.payment.network
        ? { paymentNetwork: offering.payment.network }
        : {}),
    });

    return [
      operationRow('invoke', offering.operations.invoke),
      ...(offering.operations.stream
        ? [operationRow('stream', offering.operations.stream)]
        : []),
    ];
  });
}

/** Renders the minimal, read-only endpoint directory used by server adapters. */
export async function renderLandingPage({
  manifest,
  health,
  faviconDataUrl,
  serviceUi,
}: LandingPageOptions): Promise<HtmlEscapedString> {
  const service = buildServicePageModel(manifest, { health });
  const rows = endpointRows(service.offerings);
  const resolvedUi = resolveServiceUi(serviceUi);
  const styleSheet = createServiceUiStyleSheet(resolvedUi);
  const description =
    service.agent.description ??
    'This agent has not published a description yet.';
  const fontStylesheet = resolvedUi.tokens.fonts.stylesheetUrl;

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
          data-service-ui-mode="directory"
        >
          <header class="service-header" data-region="identity">
            <div class="service-kicker">
              <span
                class="status-dot status-${service.status.state}"
                aria-hidden="true"
              ></span>
              ${service.status.label}${service.agent.version
                ? ` · v${service.agent.version}`
                : ''}
            </div>
            <h1>${service.agent.name}</h1>
            <p class="service-purpose">${description}</p>
          </header>

          <section
            class="endpoint-directory"
            data-region="endpoints"
            aria-labelledby="endpoint-directory-title"
          >
            <div class="directory-heading">
              <h2 id="endpoint-directory-title">Endpoints</h2>
              <span
                >${rows.length}
                ${rows.length === 1 ? 'endpoint' : 'endpoints'}</span
              >
            </div>

            ${rows.length
              ? html`<div class="endpoint-table-wrap">
                  <table class="endpoint-table">
                    <thead>
                      <tr>
                        <th scope="col">Endpoint</th>
                        <th scope="col">Payment method</th>
                        <th scope="col">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.map(
                        row =>
                          html`<tr>
                            <td>
                              <div class="endpoint-name">${row.title}</div>
                              <div class="endpoint-address">
                                <span>${row.operation.method}</span>
                                <code>${row.operation.path}</code>
                              </div>
                              <div class="endpoint-description">
                                ${row.description}
                              </div>
                            </td>
                            <td>
                              <span class="payment-method"
                                >${row.paymentMethod}</span
                              >
                              ${row.paymentNetwork
                                ? html`<span class="payment-network"
                                    >${row.paymentNetwork}</span
                                  >`
                                : ''}
                            </td>
                            <td class="endpoint-price">
                              ${row.operation.price ?? 'Free'}
                            </td>
                          </tr>`
                      )}
                    </tbody>
                  </table>
                </div>`
              : html`<div class="empty-state">
                  <strong>No endpoints published</strong>
                  <p>
                    Endpoints will appear here when the service registers them.
                  </p>
                </div>`}
          </section>

          <footer class="service-footer">
            <span>${service.agent.name}</span>
            <span>Generated with Lucid Agents</span>
          </footer>
        </main>
      </body>
    </html>`;
}
