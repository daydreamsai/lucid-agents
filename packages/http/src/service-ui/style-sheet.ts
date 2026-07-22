import type { ServiceUiConfig, ServiceUiFonts } from '@lucid-agents/types/http';

const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
]);

export function serializeFontStack(stack: ServiceUiFonts['body']): string {
  return stack
    .map(family => {
      const trimmed = family.trim();
      return GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())
        ? trimmed
        : `"${trimmed}"`;
    })
    .join(', ');
}

export const BASE_CSS = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--service-canvas);
  color: var(--service-text);
  font: 15px/1.5 var(--service-body);
  text-rendering: optimizeLegibility;
}

.service-page {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: 48px 32px 28px;
}

.service-header {
  padding-bottom: 32px;
  border-bottom: 1px solid var(--service-border);
}

.service-kicker {
  color: var(--service-text-muted);
  font: 600 12px/1.4 var(--service-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin: 0 8px 1px 0;
  border-radius: 50%;
  background: var(--service-text-muted);
}

.status-online {
  background: var(--service-success);
}

.status-degraded {
  background: var(--service-warning);
}

.status-offline {
  background: var(--service-danger);
}

h1,
h2 {
  margin: 0;
  color: var(--service-text);
  font-family: var(--service-display);
}

h1 {
  margin-top: 10px;
  font-size: clamp(30px, 5vw, 44px);
  line-height: 1.08;
  letter-spacing: -0.035em;
}

h2 {
  font-size: 19px;
  line-height: 1.3;
}

.service-purpose {
  max-width: 680px;
  margin: 12px 0 0;
  color: var(--service-text-muted);
  font-size: 16px;
}

.endpoint-directory {
  padding: 32px 0 40px;
}

.directory-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.directory-heading > span {
  color: var(--service-text-muted);
  font: 12px/1.4 var(--service-mono);
}

.endpoint-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--service-border);
  border-radius: 6px;
  background: var(--service-surface);
}

.endpoint-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  table-layout: fixed;
}

.endpoint-table th,
.endpoint-table td {
  padding: 15px 18px;
  border-bottom: 1px solid var(--service-border);
  text-align: left;
  vertical-align: top;
}

.endpoint-table th {
  color: var(--service-text-muted);
  background: var(--service-surface-raised);
  font: 600 11px/1.4 var(--service-mono);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.endpoint-table th:first-child {
  width: 62%;
}

.endpoint-table th:nth-child(2) {
  width: 23%;
}

.endpoint-table th:last-child {
  width: 15%;
}

.endpoint-table tbody tr:last-child td {
  border-bottom: 0;
}

.endpoint-name {
  font-weight: 700;
}

.endpoint-address {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-top: 5px;
  min-width: 0;
}

.endpoint-address > span {
  flex: none;
  color: var(--service-accent);
  font: 700 11px/1.4 var(--service-mono);
}

.endpoint-address code {
  min-width: 0;
  color: var(--service-text);
  font: 12px/1.5 var(--service-mono);
  overflow-wrap: anywhere;
}

.endpoint-description,
.payment-network {
  display: block;
  margin-top: 5px;
  color: var(--service-text-muted);
  font-size: 13px;
}

.payment-method,
.endpoint-price {
  font: 600 13px/1.5 var(--service-mono);
}

.endpoint-price {
  white-space: nowrap;
}

.empty-state {
  padding: 28px;
  border: 1px solid var(--service-border);
  border-radius: 6px;
  background: var(--service-surface);
}

.empty-state p {
  margin: 4px 0 0;
  color: var(--service-text-muted);
}

.service-footer {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--service-border);
  color: var(--service-text-muted);
  font: 11px/1.4 var(--service-mono);
}

@media (hover: hover) and (pointer: fine) {
  .endpoint-table tbody tr:hover {
    background: var(--service-surface-raised);
  }
}

@media (max-width: 680px) {
  .service-page {
    padding: 28px 16px 20px;
  }

  .service-header {
    padding-bottom: 24px;
  }

  .endpoint-directory {
    padding-block: 24px 32px;
  }

  .endpoint-table-wrap {
    margin-inline: -16px;
    border-inline: 0;
    border-radius: 0;
  }

  .service-footer {
    display: grid;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}`;

export const PRESET_LAYOUT_CSS: Record<ServiceUiConfig['preset'], string> = {
  dossier: `[data-service-ui-preset="dossier"] {
  font-family: var(--service-mono);
}`,
  folio: `[data-service-ui-preset="folio"] h1 {
  font-size: clamp(36px, 6vw, 54px);
  font-weight: 500;
}

[data-service-ui-preset="folio"] .endpoint-table-wrap,
[data-service-ui-preset="folio"] .empty-state {
  border-radius: 2px;
}`,
  console: `[data-service-ui-preset="console"] {
  width: min(1080px, 100%);
  font-family: var(--service-mono);
}

[data-service-ui-preset="console"] .endpoint-table th,
[data-service-ui-preset="console"] .endpoint-table td {
  padding-block: 12px;
}`,
};
