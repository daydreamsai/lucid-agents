#!/usr/bin/env bash

set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for the deployed preview Playwright test" >&2
  exit 1
fi

BASE_URL="${1:-}"
PRESET="${2:-}"
if [[ ! "$BASE_URL" =~ ^https?:// ]] || [[ ! "$PRESET" =~ ^(dossier|folio|console)$ ]]; then
  echo "Usage: bash scripts/test-service-ui-preview.sh <preview-url> <dossier|folio|console>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$REPO_ROOT/output/playwright/cloudflare-$PRESET"
SESSION="lucid-preview-${GITHUB_RUN_ID:-local}-$PRESET-$$"
PWCLI=(npx --yes --package @playwright/cli@0.1.17 playwright-cli --session "$SESSION")

cleanup() {
  "${PWCLI[@]}" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$ARTIFACT_DIR"
cd "$ARTIFACT_DIR"

"${PWCLI[@]}" open "$BASE_URL" >open.log
"${PWCLI[@]}" resize 1440 1000 >/dev/null

STATE=""
for _ in $(seq 1 40); do
  STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ preset: document.querySelector('[data-service-ui-preset]')?.getAttribute('data-service-ui-preset'), mode: document.querySelector('[data-service-ui-mode]')?.getAttribute('data-service-ui-mode'), identity: document.querySelector('h1')?.textContent, offerings: document.querySelectorAll('.offering-list button').length, provider: document.body.textContent?.includes('Lucid Agents CI'), details: document.querySelectorAll('.service-details .detail-card').length, rawCard: Boolean(document.querySelector('[data-region=raw-card]')) })")"
  if [[ "$STATE" == *"$PRESET"* ]]; then
    break
  fi
  sleep 0.25
done
printf '%s\n' "$STATE" >state.json

PRESET="$PRESET" bun -e '
  const preset = Bun.env.PRESET;
  let state = JSON.parse(await Bun.file("state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.preset !== preset || state.mode !== "interactive") throw new Error(`${preset} deployed theme marker was incorrect`);
  if (!state.identity?.includes(preset) || state.offerings < 6) throw new Error(`${preset} deployed kitchen-sink offerings were incomplete`);
  if (!state.provider || state.details < 7 || !state.rawCard) throw new Error(`${preset} deployed public information was incomplete`);
'

"${PWCLI[@]}" --raw eval "() => { const input = document.querySelector('.offering-workspace textarea'); const button = document.querySelector('.offering-workspace .primary-button'); if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error('interactive controls missing'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(input, JSON.stringify({ input: { text: '$PRESET deployed preview' } })); input.dispatchEvent(new Event('input', { bubbles: true })); button.click(); }" >/dev/null

RUN_STATE=""
for _ in $(seq 1 40); do
  RUN_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ success: document.querySelector('.run-state')?.classList.contains('state-success'), output: document.querySelector('.run-state pre')?.textContent })")"
  if [[ "$RUN_STATE" == *success*true* ]]; then
    break
  fi
  sleep 0.25
done
printf '%s\n' "$RUN_STATE" >run.json

PRESET="$PRESET" bun -e '
  const preset = Bun.env.PRESET;
  let state = JSON.parse(await Bun.file("run.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (!state.success || !state.output?.includes(`${preset} deployed preview`)) throw new Error(`${preset} deployed invocation failed`);
'

"${PWCLI[@]}" resize 390 844 >/dev/null
"${PWCLI[@]}" goto "$BASE_URL" >/dev/null
MOBILE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ width: innerWidth, list: document.querySelector('.service-layout')?.classList.contains('show-mobile-list'), rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspace: getComputedStyle(document.querySelector('.offering-workspace')).display })")"
printf '%s\n' "$MOBILE" >mobile.json
bun -e '
  let state = JSON.parse(await Bun.file("mobile.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.width !== 390 || !state.list || state.rail === "none" || state.workspace !== "none") throw new Error("deployed mobile drill-in layout failed");
'

"${PWCLI[@]}" snapshot >snapshot.log
"${PWCLI[@]}" screenshot >screenshot.log
CONSOLE_ERRORS="$("${PWCLI[@]}" --raw console error)"
printf '%s\n' "$CONSOLE_ERRORS" >console-errors.log
if [[ -n "$CONSOLE_ERRORS" && "$CONSOLE_ERRORS" != *"Errors: 0"* ]]; then
  echo "Browser console errors detected for deployed $PRESET preview:" >&2
  echo "$CONSOLE_ERRORS" >&2
  exit 1
fi

echo "verified deployed $PRESET kitchen-sink preview with Playwright"
