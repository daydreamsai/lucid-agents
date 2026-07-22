import {
  type ServicePageModel,
  type ServicePageOffering,
  type ServicePageOperation,
} from '@lucid-agents/http';
import {
  createServiceUiStyleSheet,
  resolveServiceUi,
} from '@lucid-agents/http/service-ui';
import type { ServiceUiConfig } from '@lucid-agents/types/http';

export type ServiceStorefrontProps = {
  service: ServicePageModel;
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

export function ServiceStorefront({
  service,
  serviceUi,
}: ServiceStorefrontProps) {
  const resolvedUi = resolveServiceUi(serviceUi);
  const styleSheet = createServiceUiStyleSheet(resolvedUi);
  const rows = endpointRows(service.offerings);
  const description =
    service.agent.description ??
    'This agent has not published a description yet.';

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
        data-service-ui-mode="directory"
      >
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
          <p className="service-purpose">{description}</p>
        </header>

        <section
          className="endpoint-directory"
          data-region="endpoints"
          aria-labelledby="endpoint-directory-title"
        >
          <div className="directory-heading">
            <h2 id="endpoint-directory-title">Endpoints</h2>
            <span>
              {rows.length} {rows.length === 1 ? 'endpoint' : 'endpoints'}
            </span>
          </div>

          {rows.length > 0 ? (
            <div className="endpoint-table-wrap">
              <table className="endpoint-table">
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Payment method</th>
                    <th scope="col">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key}>
                      <td>
                        <div className="endpoint-name">{row.title}</div>
                        <div className="endpoint-address">
                          <span>{row.operation.method}</span>
                          <code>{row.operation.path}</code>
                        </div>
                        <div className="endpoint-description">
                          {row.description}
                        </div>
                      </td>
                      <td>
                        <span className="payment-method">
                          {row.paymentMethod}
                        </span>
                        {row.paymentNetwork ? (
                          <span className="payment-network">
                            {row.paymentNetwork}
                          </span>
                        ) : null}
                      </td>
                      <td className="endpoint-price">
                        {row.operation.price ?? 'Free'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <strong>No endpoints published</strong>
              <p>Endpoints will appear here when the service registers them.</p>
            </div>
          )}
        </section>

        <footer className="service-footer">
          <span>{service.agent.name}</span>
          <span>Generated with Lucid Agents</span>
        </footer>
      </main>
    </>
  );
}
