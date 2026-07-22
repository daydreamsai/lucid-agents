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

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background: var(--service-canvas);
  color: var(--service-text);
  font: 16px/1.55 var(--service-body);
  text-rendering: optimizeLegibility;
}

button,
textarea,
input {
  font: inherit;
}

a {
  color: var(--service-accent);
  text-underline-offset: 3px;
}

button:focus-visible,
a:focus-visible,
textarea:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--service-accent);
  outline-offset: 2px;
}

[tabindex='-1']:focus-visible {
  outline: none;
}

.service-page {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 0 36px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.service-header {
  padding: 32px 0 24px;
  border-bottom: 1px solid var(--service-border);
}

.service-kicker,
.kicker,
.section-label {
  color: var(--service-text-muted);
  font: 650 12px/1.4 var(--service-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.code-caption {
  margin: 16px 0 0;
  color: var(--service-text-muted);
  font: 550 12px/1.4 var(--service-mono);
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--service-text-muted);
}

.status-online,
.state-success .state-indicator,
.state-partial .state-indicator {
  background: var(--service-success);
}

.status-degraded,
.state-payment .state-indicator,
.state-authorization .state-indicator,
.state-network-mismatch .state-indicator {
  background: var(--service-warning);
}

.status-offline,
.state-recoverable-error .state-indicator,
.state-invalid .state-indicator {
  background: var(--service-danger);
}

.state-running .state-indicator,
.state-preparing .state-indicator {
  background: var(--service-accent);
}

.state-running .state-indicator,
.state-preparing .state-indicator,
.state-partial .state-indicator {
  animation: service-pulse 1.2s ease-in-out infinite alternate;
}

@keyframes service-pulse {
  to {
    opacity: 0.35;
  }
}

h1,
h2,
h3 {
  margin-block: 0;
  color: var(--service-text);
  font-family: var(--service-display);
}

h1 {
  max-width: 920px;
  margin-top: 8px;
  font-size: clamp(30px, 3.2vw, 44px);
  line-height: 1.05;
  letter-spacing: -0.045em;
}

h2 {
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.12;
  letter-spacing: -0.035em;
}

h3 {
  font-size: 18px;
  line-height: 1.25;
}

.service-purpose,
.purpose {
  max-width: 760px;
  margin: 12px 0 0;
  color: var(--service-text-muted);
  font-size: clamp(16px, 1.2vw, 17px);
}

.identity-meta,
.trust-line,
.operation-facts,
.facts,
.tag-list,
.mode-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.identity-meta,
.trust-line {
  gap: 8px 16px;
  margin-top: 16px;
  color: var(--service-text-muted);
  font: 550 12px/1.4 var(--service-mono);
}

.trust-line li::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 8px 2px 0;
  border-radius: 50%;
  background: var(--service-success);
}

.service-layout {
  display: grid;
  min-width: 0;
  border-bottom: 1px solid var(--service-border);
}

.offering-rail {
  min-width: 0;
  padding: 32px 24px 40px 0;
}

.offering-rail > .section-label {
  display: block;
  margin-bottom: 16px;
}

.offering-list,
.offering-rail ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.offering-list li,
.offering-rail li {
  border-top: 1px solid var(--service-border);
}

.offering-list li:last-child,
.offering-rail li:last-child {
  border-bottom: 1px solid var(--service-border);
}

.offering-list button,
.offering-rail a {
  display: grid;
  width: 100%;
  gap: 8px;
  padding: 16px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}

.offering-list button:active {
  background: var(--service-surface-raised);
}

.offering-list .is-selected button,
.offering-rail a[aria-current='page'] {
  box-shadow: inset 3px 0 0 var(--service-accent);
  background: var(--service-surface);
}

.offering-title,
.offering-rail strong {
  font-weight: 750;
}

.offering-description,
.offering-rail small {
  color: var(--service-text-muted);
}

.offering-meta,
.price {
  color: var(--service-accent);
  font: 600 12px/1.4 var(--service-mono);
}

.workspaces,
.offering-workspace,
.workspace-empty {
  min-width: 0;
}

.workspaces {
  padding: 32px 0 52px 40px;
}

.workspace,
.offering-workspace {
  min-width: 0;
  padding-bottom: 48px;
  scroll-margin-top: 28px;
}

.workspace + .workspace {
  padding-top: 48px;
  border-top: 1px solid var(--service-border);
}

.workspace-header h2 {
  margin-top: 8px;
}

.workspace-header p {
  max-width: 660px;
  margin: 12px 0 0;
  color: var(--service-text-muted);
}

.operation-facts,
.facts {
  justify-content: flex-start;
  gap: 8px;
  margin-top: 16px;
}

.operation-facts span,
.facts span,
.tag-list li,
.mode-list li {
  padding: 4px 8px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  font: 600 12px/1.2 var(--service-mono);
}

.input-section,
.request-contract,
.readiness-panel,
.run-state,
.integration-section,
.contract-block {
  margin-top: 24px;
}

.section-heading-row,
.endpoint-line,
.run-state-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

textarea,
pre,
.code-block {
  width: 100%;
  overflow: auto;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-code);
  color: var(--service-text);
  font: 13px/1.65 var(--service-mono);
  tab-size: 2;
}

textarea {
  min-height: 192px;
  margin-top: 12px;
  padding: 16px;
  resize: vertical;
}

pre,
.code-block {
  margin: 12px 0 0;
  padding: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

code {
  font-family: var(--service-mono);
  overflow-wrap: anywhere;
}

a {
  overflow-wrap: anywhere;
}

.service-header a,
.detail-card a,
.service-footer a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
}

.schema-grid,
.contract-grid,
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.protected-note,
.readiness-panel,
.run-state,
.detail-card,
.empty-state,
.empty {
  padding: 16px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-surface);
}

.protected-note {
  margin-top: 16px;
}

.protected-note p,
.readiness-panel p,
.run-placeholder,
.empty-state,
.empty {
  margin-block: 4px 0;
  color: var(--service-text-muted);
}

.example-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  color: var(--service-text-muted);
  font: 13px/1.5 var(--service-mono);
}

.credential-field {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.credential-field input {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-code);
  color: var(--service-text);
}

.run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 20px 0;
}

.primary-button,
.secondary-button,
.text-button,
.mobile-back,
.integration-toggle {
  min-height: 44px;
  cursor: pointer;
  font-weight: 750;
}

.primary-button,
.secondary-button {
  padding: 8px 16px;
  border-radius: 4px;
  transition:
    transform 140ms cubic-bezier(0.23, 1, 0.32, 1),
    filter 140ms ease,
    background-color 140ms ease,
    opacity 140ms ease;
}

.primary-button {
  border: 1px solid var(--service-accent);
  background: var(--service-accent);
  color: var(--service-accent-text);
}

.secondary-button {
  border: 1px solid var(--service-border);
  background: transparent;
  color: var(--service-text);
}

.primary-button:active:not(:disabled),
.secondary-button:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-button:disabled,
.secondary-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.text-button,
.mobile-back,
.integration-toggle {
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--service-accent);
}

.text-button:active,
.mobile-back:active,
.integration-toggle:active {
  opacity: 0.7;
}

.integration-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.text-button.danger,
.error-message {
  color: var(--service-danger);
}

.mobile-back {
  display: none;
}

.run-state {
  min-height: 160px;
}

.run-state-heading {
  justify-content: flex-start;
}

.state-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--service-text-muted);
}

.state-note,
.task-reference {
  color: var(--service-text-muted);
  font: 600 12px/1.4 var(--service-mono);
}

details {
  margin-top: 16px;
  border-top: 1px solid var(--service-border);
}

summary {
  min-height: 48px;
  padding-top: 16px;
  cursor: pointer;
  font-weight: 750;
}

.service-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 32px 28px;
  padding: 32px 0;
  border-bottom: 1px solid var(--service-border);
}

.service-details > .section-label,
.raw-card > .section-label {
  grid-column: 1 / -1;
}

.detail-card h3 {
  margin-bottom: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--service-border);
}

.service-details > .detail-card {
  align-self: start;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.service-details > .detail-card:last-child {
  grid-column: 1 / -1;
}

.service-details > .detail-card:last-child .capability-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 28px;
}

.detail-list,
.capability-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.detail-list > div,
.capability-list > li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  min-height: 52px;
  gap: 16px;
  padding: 4px 0;
  border-bottom: 1px solid var(--service-border);
}

.detail-list dt,
.capability-list span {
  color: var(--service-text-muted);
}

.detail-list dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.detail-list dd a,
.detail-list dd code {
  font-family: var(--service-mono);
  font-size: 13px;
}

.capability-list > li > span {
  min-width: 0;
}

.raw-card {
  padding: 40px 0;
  border-bottom: 1px solid var(--service-border);
}

.service-footer,
footer {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 0 40px;
  color: var(--service-text-muted);
  font: 12px/1.4 var(--service-mono);
}

@media (hover: hover) and (pointer: fine) {
  .offering-list button:hover,
  .offering-rail a:hover {
    background: var(--service-surface-raised);
  }

  .primary-button:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .secondary-button:hover:not(:disabled) {
    background: var(--service-surface-raised);
  }
}

@media (max-width: 767px) {
  .service-page {
    padding-inline: 16px;
  }

  .service-details,
  .schema-grid,
  .contract-grid,
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .offering-rail {
    padding-right: 0;
    border-bottom: 1px solid var(--service-border);
  }

  .workspaces {
    padding-left: 0;
  }

  [data-service-ui-mode='interactive'] .service-layout.show-mobile-list .offering-workspace,
  [data-service-ui-mode='interactive'] .service-layout.show-mobile-list .workspace-empty {
    display: none;
  }

  [data-service-ui-mode='interactive'] .service-layout:not(.show-mobile-list) .offering-rail {
    display: none;
  }

  [data-service-ui-mode='interactive'] .mobile-back {
    display: inline-flex;
    align-items: center;
    margin-bottom: 20px;
  }

  .service-details > .detail-card:last-child .capability-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .service-footer,
  footer {
    display: grid;
  }
}

@media (max-width: 480px) {
  .run-actions {
    position: sticky;
    z-index: 3;
    bottom: 0;
    margin-inline: -16px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    border-block: 1px solid var(--service-border);
    background: var(--service-canvas);
  }

  .run-actions .primary-button {
    flex: 1;
  }

  textarea {
    margin-inline: -16px;
    width: calc(100% + 32px);
    border-inline: 0;
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}`;

export const PRESET_LAYOUT_CSS: Record<ServiceUiConfig['preset'], string> = {
  dossier: `[data-service-ui-preset="dossier"] {
  font-family: var(--service-mono);
}

[data-service-ui-preset="dossier"] h1,
[data-service-ui-preset="dossier"] h2 {
  letter-spacing: -0.01em;
}

@media (min-width: 768px) {
  [data-service-ui-preset="dossier"] .service-layout {
    grid-template-columns: 320px minmax(0, 1fr);
  }

  [data-service-ui-preset="dossier"] .offering-rail {
    position: sticky;
    top: 0;
    align-self: start;
    border-right: 1px solid var(--service-border);
  }
}

@media (min-width: 768px) and (max-width: 1199px) {
  [data-service-ui-preset="dossier"] .service-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  [data-service-ui-preset="dossier"] .offering-rail {
    padding-right: 16px;
  }

  [data-service-ui-preset="dossier"] .workspaces {
    padding-left: 24px;
  }
}

@media (min-width: 1200px) {
  [data-service-ui-preset="dossier"] .service-layout {
    grid-template-columns: 320px minmax(0, 1fr);
  }
}`,
  folio: `[data-service-ui-preset="folio"] .service-page {
  width: min(1360px, 100%);
}

[data-service-ui-preset="folio"] .service-header {
  padding-block: 40px 28px;
}

[data-service-ui-preset="folio"] h1 {
  max-width: 1050px;
  font-size: clamp(40px, 5.5vw, 70px);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.04em;
}

[data-service-ui-preset="folio"] .offering-rail {
  padding: 0;
}

@media (min-width: 768px) {
  [data-service-ui-preset="folio"] .service-layout {
    grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.7fr);
    gap: 28px;
    padding-block: 28px;
  }

  [data-service-ui-preset="folio"] .offering-rail {
    position: sticky;
    top: 24px;
    align-self: start;
  }
}

[data-service-ui-preset="folio"] .offering-list,
[data-service-ui-preset="folio"] .offering-rail ul {
  display: grid;
  gap: 0;
}

[data-service-ui-preset="folio"] .offering-list li,
[data-service-ui-preset="folio"] .offering-rail li {
  border-top: 1px solid var(--service-border);
}

[data-service-ui-preset="folio"] .offering-list li:last-child,
[data-service-ui-preset="folio"] .offering-rail li:last-child {
  border-bottom: 1px solid var(--service-border);
}

[data-service-ui-preset="folio"] .protected-note,
[data-service-ui-preset="folio"] .readiness-panel,
[data-service-ui-preset="folio"] .run-state {
  border: 1px solid var(--service-border);
  border-radius: 6px;
  background: var(--service-surface);
}

[data-service-ui-preset="folio"] .offering-list .is-selected button,
[data-service-ui-preset="folio"] .offering-rail a[aria-current='page'] {
  box-shadow: inset 3px 0 0 var(--service-accent);
}

[data-service-ui-preset="folio"] .workspaces {
  padding: 0;
}

[data-service-ui-preset="folio"] .workspace,
[data-service-ui-preset="folio"] .offering-workspace {
  padding: 0 0 40px 28px;
  border: 0;
  border-left: 1px solid var(--service-border);
  border-radius: 0;
  background: transparent;
}

[data-service-ui-preset="folio"] .workspace + .workspace {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--service-border);
}

@media (min-width: 768px) and (max-width: 1199px) {
  [data-service-ui-preset="folio"] .service-layout {
    grid-template-columns: minmax(220px, 0.62fr) minmax(0, 1.7fr);
    gap: 24px;
  }
}

@media (max-width: 767px) {
  [data-service-ui-preset="folio"] .service-layout {
    gap: 0;
    padding-block: 24px;
  }

  [data-service-ui-preset="folio"] .workspace,
  [data-service-ui-preset="folio"] .offering-workspace {
    padding: 0 0 40px;
    border-left: 0;
  }
}`,
  console: `[data-service-ui-preset="console"] .service-page {
  width: min(1480px, 100%);
  padding-inline: 24px;
}

[data-service-ui-preset="console"] .service-header {
  padding-block: 24px 16px;
}

[data-service-ui-preset="console"] .service-layout {
  grid-template-columns: minmax(0, 1fr);
}

[data-service-ui-preset="console"] .offering-rail {
  position: sticky;
  z-index: 4;
  top: 0;
  padding: 16px 0;
  border-bottom: 1px solid var(--service-border);
  background: var(--service-canvas);
}

[data-service-ui-preset="console"] .offering-rail > .section-label {
  margin-bottom: 8px;
}

[data-service-ui-preset="console"] .offering-list,
[data-service-ui-preset="console"] .offering-rail ul {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

[data-service-ui-preset="console"] .offering-list li,
[data-service-ui-preset="console"] .offering-rail li,
[data-service-ui-preset="console"] .offering-list li:last-child,
[data-service-ui-preset="console"] .offering-rail li:last-child {
  flex: 0 0 min(300px, 76vw);
  border: 0;
}

[data-service-ui-preset="console"] .offering-list button,
[data-service-ui-preset="console"] .offering-rail a {
  height: 100%;
  grid-template-rows: auto 1fr auto;
  border: 1px solid var(--service-border);
  border-radius: 4px;
  background: var(--service-surface);
}

[data-service-ui-preset="console"] .offering-list .is-selected button,
[data-service-ui-preset="console"] .offering-rail a[aria-current='page'] {
  box-shadow: inset 0 -3px 0 var(--service-accent);
}

@media (min-width: 1200px) {
  [data-service-ui-preset="console"] .offering-list,
  [data-service-ui-preset="console"] .offering-rail ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0;
    overflow-x: visible;
    border-left: 1px solid var(--service-border);
  }

  [data-service-ui-preset="console"] .offering-list li,
  [data-service-ui-preset="console"] .offering-rail li,
  [data-service-ui-preset="console"] .offering-list li:last-child,
  [data-service-ui-preset="console"] .offering-rail li:last-child {
    display: flex;
    min-width: 0;
    border: 0;
    border-right: 1px solid var(--service-border);
  }

  [data-service-ui-preset="console"] .offering-list button,
  [data-service-ui-preset="console"] .offering-rail a {
    height: 100%;
    gap: 4px;
    padding: 12px;
    border: 0;
    border-block: 1px solid var(--service-border);
    border-radius: 0;
    background: transparent;
  }

  [data-service-ui-preset="console"] .offering-description,
  [data-service-ui-preset="console"] .offering-rail small {
    font-size: 14px;
    line-height: 1.4;
  }
}

[data-service-ui-preset="console"] .workspaces {
  padding: 24px 0 44px;
}

[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .workspace,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .offering-workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 0 24px;
}

[data-service-ui-preset="console"] textarea {
  min-height: 160px;
}

[data-service-ui-preset="console"] .run-actions {
  align-self: start;
}

[data-service-ui-preset="console"] .run-state {
  min-height: 132px;
}

[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .workspace-header,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .mobile-back,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .readiness-panel,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .integration-section,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .protected-note,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .tag-list {
  grid-column: 1 / -1;
}

[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .input-section,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .run-actions,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .request-contract {
  grid-column: 1;
}

[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .run-state,
[data-service-ui-preset="console"][data-service-ui-mode="interactive"] .contract-output {
  grid-column: 2;
}

@media (max-width: 900px) {
  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .workspace,
  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .offering-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .input-section,
  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .request-contract,
  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .run-state,
  [data-service-ui-preset="console"][data-service-ui-mode="interactive"] .contract-output {
    grid-column: 1;
  }
}

@media (max-width: 767px) {
  [data-service-ui-preset="console"] .service-page {
    padding-inline: 16px;
  }

  [data-service-ui-preset="console"] .offering-rail {
    padding: 16px 0 24px;
    border-bottom: 0;
  }

  [data-service-ui-preset="console"] .offering-rail > .section-label {
    margin-bottom: 8px;
  }

  [data-service-ui-preset="console"] .offering-list,
  [data-service-ui-preset="console"] .offering-rail ul {
    display: grid;
    gap: 0;
    overflow-x: visible;
  }

  [data-service-ui-preset="console"] .offering-list li,
  [data-service-ui-preset="console"] .offering-rail li,
  [data-service-ui-preset="console"] .offering-list li:last-child,
  [data-service-ui-preset="console"] .offering-rail li:last-child {
    flex: none;
    border-top: 1px solid var(--service-border);
  }

  [data-service-ui-preset="console"] .offering-list li:last-child,
  [data-service-ui-preset="console"] .offering-rail li:last-child {
    border-bottom: 1px solid var(--service-border);
  }

  [data-service-ui-preset="console"] .offering-list button,
  [data-service-ui-preset="console"] .offering-rail a {
    height: auto;
    padding: 16px 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  [data-service-ui-preset="console"] .offering-list .is-selected button,
  [data-service-ui-preset="console"] .offering-rail a[aria-current='page'] {
    box-shadow: inset 3px 0 0 var(--service-accent);
  }
}`,
};
