#!/usr/bin/env bash

set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for the Playwright CLI browser smoke test" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$REPO_ROOT/output/playwright"
SESSION="lucid-ci-${GITHUB_RUN_ID:-local}-$$"
PWCLI=(npx --yes --package @playwright/cli@0.1.17 playwright-cli --session "$SESSION")
PORT="${BROWSER_SMOKE_PORT:-41791}"
CLIENT_PORT="$((PORT + 1))"
SERVER_PID=""
REACT_SERVER_PID=""
GENERATED_ROOT=""
GENERATED_ROOT_FILE=""

cleanup() {
  "${PWCLI[@]}" snapshot >"$ARTIFACT_DIR/final-snapshot.log" 2>&1 || true
  "${PWCLI[@]}" screenshot >"$ARTIFACT_DIR/screenshot.log" 2>&1 || true
  "${PWCLI[@]}" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$REACT_SERVER_PID" ]]; then
    kill "$REACT_SERVER_PID" >/dev/null 2>&1 || true
    wait "$REACT_SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -z "$GENERATED_ROOT" && -n "$GENERATED_ROOT_FILE" && -f "$GENERATED_ROOT_FILE" ]]; then
    GENERATED_ROOT="$(tr -d '\n' <"$GENERATED_ROOT_FILE")"
  fi
  if [[ -n "$GENERATED_ROOT" && -d "$GENERATED_ROOT" && "$GENERATED_ROOT" == *"/lucid-generated-e2e-"* ]]; then
    rm -rf "$GENERATED_ROOT"
  fi
}
trap cleanup EXIT

mkdir -p "$ARTIFACT_DIR"
cd "$ARTIFACT_DIR"

PORT="$PORT" \
CLIENT_PORT="$CLIENT_PORT" \
RUN_A2A_DEMO=false \
QUIET=true \
bun run "$REPO_ROOT/packages/examples/src/kitchen-sink/index.ts" \
  >server.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 100); do
  if curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null

"${PWCLI[@]}" open "http://127.0.0.1:$PORT" >open.log
"${PWCLI[@]}" resize 1440 1000 >/dev/null
"${PWCLI[@]}" reload >/dev/null
"${PWCLI[@]}" snapshot >snapshot.log
PAGE_STATE=""
for _ in $(seq 1 50); do
  PAGE_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ title: document.title, identity: document.querySelector('h1')?.textContent, offering: document.querySelector('.offering-rail strong')?.textContent, workspace: document.querySelector('[data-workspace]:not([hidden]) h2')?.textContent, width: innerWidth, columns: getComputedStyle(document.querySelector('.service-layout')).gridTemplateColumns, scheme: getComputedStyle(document.documentElement).colorScheme, font: getComputedStyle(document.body).fontFamily, headingIcon: Boolean(document.querySelector('.service-header .monogram, .service-header img')) })")"
  if [[ "$PAGE_STATE" == *'\"workspace\":\"Echo\"'* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$PAGE_STATE" >page-state.json

bun -e '
  let state = JSON.parse(await Bun.file("page-state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.title !== "kitchen-sink-agent") throw new Error("wrong page title");
  if (state.identity !== "kitchen-sink-agent") throw new Error("agent identity was not rendered");
  if (state.offering !== "Echo") throw new Error("echo offering was not rendered");
  if (state.workspace !== "Echo") throw new Error("echo workspace was not selected");
  if (state.width !== 1440) throw new Error("desktop viewport was not applied");
  if (!state.columns.startsWith("320px")) throw new Error("desktop offering rail is not 320px");
  if (state.scheme !== "dark") throw new Error("portable storefront is not dark mode");
  if (!/mono/i.test(state.font)) throw new Error("portable storefront is not monospace");
  if (state.headingIcon) throw new Error("portable storefront still renders a heading icon");
'

"${PWCLI[@]}" press Tab >/dev/null
DESKTOP_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-rail a') === true")"
if [[ "$DESKTOP_FOCUS" != "true" ]]; then
  echo "first keyboard stop was not the offering rail" >&2
  exit 1
fi
"${PWCLI[@]}" press Enter >/dev/null
WORKSPACE_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('[data-workspace] h2') === true")"
if [[ "$WORKSPACE_FOCUS" != "true" ]]; then
  echo "offering selection did not move focus to its workspace" >&2
  exit 1
fi

"${PWCLI[@]}" --raw eval "() => { const workspace = document.querySelector('[data-workspace]:not([hidden])'); const input = workspace?.querySelector('textarea'); const button = workspace?.querySelector('[data-action=invoke]'); if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error('echo controls missing'); input.value = JSON.stringify({ input: { text: 'browser smoke' } }); input.dispatchEvent(new Event('input', { bubbles: true })); button.click(); }" >/dev/null

RUN_STATE=""
for _ in $(seq 1 100); do
  RUN_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ phase: document.querySelector('[data-workspace]:not([hidden]) [data-run-state]')?.getAttribute('data-phase'), output: document.querySelector('[data-workspace]:not([hidden]) [data-output]')?.textContent })")"
  if [[ "$RUN_STATE" == *'\"phase\":\"success\"'* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$RUN_STATE" >run-state.json

bun -e '
  let state = JSON.parse(await Bun.file("run-state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.phase !== "success") throw new Error("echo invocation did not complete");
  if (!state.output?.includes("browser smoke")) throw new Error("echo output was not rendered");
'

"${PWCLI[@]}" resize 390 844 >/dev/null
"${PWCLI[@]}" goto "http://127.0.0.1:$PORT" >/dev/null
MOBILE_LIST="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ width: innerWidth, rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspace: getComputedStyle(document.querySelector('.workspaces')).display, sticky: getComputedStyle(document.querySelector('.actions')).position })")"
printf '%s\n' "$MOBILE_LIST" >mobile-list.json
bun -e '
  let state = JSON.parse(await Bun.file("mobile-list.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.width !== 390) throw new Error("mobile viewport was not applied");
  if (state.rail === "none") throw new Error("mobile offering list was not shown first");
  if (state.workspace !== "none") throw new Error("mobile workspace should use drill-in navigation");
  if (state.sticky !== "sticky") throw new Error("mobile actions are not sticky");
'
"${PWCLI[@]}" press Tab >/dev/null
"${PWCLI[@]}" press Enter >/dev/null
MOBILE_WORKSPACE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspace: getComputedStyle(document.querySelector('.workspaces')).display, focused: document.activeElement?.matches('[data-workspace] h2') === true })")"
printf '%s\n' "$MOBILE_WORKSPACE" >mobile-workspace.json
bun -e '
  let state = JSON.parse(await Bun.file("mobile-workspace.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.rail !== "none") throw new Error("mobile rail remained visible after selection");
  if (state.workspace === "none") throw new Error("mobile workspace did not open");
  if (!state.focused) throw new Error("mobile workspace heading did not receive focus");
'
"${PWCLI[@]}" --raw eval "() => document.querySelector('[data-action=back]')?.click()" >/dev/null
MOBILE_BACK="$("${PWCLI[@]}" --raw eval "() => getComputedStyle(document.querySelector('.offering-rail')).display !== 'none'")"
if [[ "$MOBILE_BACK" != "true" ]]; then
  echo "mobile back control did not restore the offering list" >&2
  exit 1
fi

GENERATED_ROOT_FILE="$ARTIFACT_DIR/generated-root.txt"
GENERATED_PROJECT_KEEP=true \
GENERATED_PROJECT_ROOT_FILE="$GENERATED_ROOT_FILE" \
bun run "$REPO_ROOT/scripts/test-generated-project.ts" next \
  >generated-next.log 2>&1
GENERATED_ROOT="$(tr -d '\n' <"$GENERATED_ROOT_FILE")"
REACT_PROJECT="$GENERATED_ROOT/generated-next"
REACT_PORT="$((PORT + 2))"
PORT="$REACT_PORT" bun run --cwd "$REACT_PROJECT" start \
  >react-server.log 2>&1 &
REACT_SERVER_PID=$!

for _ in $(seq 1 200); do
  if curl --fail --silent "http://127.0.0.1:$REACT_PORT/api/agent/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent "http://127.0.0.1:$REACT_PORT/api/agent/health" >/dev/null

"${PWCLI[@]}" resize 1440 1000 >/dev/null
"${PWCLI[@]}" goto "http://127.0.0.1:$REACT_PORT" >/dev/null
REACT_DESKTOP=""
for _ in $(seq 1 100); do
  REACT_DESKTOP="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ identity: document.querySelector('h1')?.textContent, offering: document.querySelector('.offering-list button')?.textContent, workspace: document.querySelector('.offering-workspace h2')?.textContent, live: document.querySelector('.run-state')?.getAttribute('aria-live'), columns: document.querySelector('.service-layout') ? getComputedStyle(document.querySelector('.service-layout')).gridTemplateColumns : '', scheme: getComputedStyle(document.documentElement).colorScheme, font: getComputedStyle(document.body).fontFamily, headingIcon: Boolean(document.querySelector('.service-header .service-icon, .service-header .service-monogram, .service-header img')) })")"
  if [[ "$REACT_DESKTOP" == *'\"workspace\":\"Echo\"'* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$REACT_DESKTOP" >react-desktop.json
bun -e '
  let state = JSON.parse(await Bun.file("react-desktop.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.identity !== "generated-next") throw new Error("generated React identity was not rendered");
  if (!state.offering?.includes("Echo")) throw new Error("generated React offering was not rendered");
  if (state.workspace !== "Echo") throw new Error("generated React workspace was not selected");
  if (state.live !== "polite") throw new Error("generated React run state is not announced");
  if (!state.columns.startsWith("320px")) throw new Error("generated React desktop rail is not 320px");
  if (state.scheme !== "dark") throw new Error("generated React storefront is not dark mode");
  if (!/mono/i.test(state.font)) throw new Error("generated React storefront is not monospace");
  if (state.headingIcon) throw new Error("generated React storefront still renders a heading icon");
'
"${PWCLI[@]}" press Tab >/dev/null
REACT_RAIL_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-list button') === true")"
if [[ "$REACT_RAIL_FOCUS" != "true" ]]; then
  echo "generated React offering rail was not keyboard reachable" >&2
  exit 1
fi
"${PWCLI[@]}" press Enter >/dev/null
REACT_WORKSPACE_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-workspace h2') === true")"
if [[ "$REACT_WORKSPACE_FOCUS" != "true" ]]; then
  echo "generated React selection did not move focus" >&2
  exit 1
fi

"${PWCLI[@]}" --raw eval "() => { const input = document.querySelector('.offering-workspace textarea'); const button = document.querySelector('.offering-workspace .primary-button'); if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error('generated React controls missing'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(input, JSON.stringify({ input: { text: 'react browser smoke' } })); input.dispatchEvent(new Event('input', { bubbles: true })); button.click(); }" >/dev/null
REACT_RUN=""
for _ in $(seq 1 100); do
  REACT_RUN="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ success: document.querySelector('.run-state')?.classList.contains('state-success'), output: document.querySelector('.run-state pre')?.textContent })")"
  if [[ "$REACT_RUN" == *'\"success\":true'* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$REACT_RUN" >react-run.json
bun -e '
  let state = JSON.parse(await Bun.file("react-run.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (!state.success) throw new Error("generated React invocation did not complete");
  if (!state.output?.includes("react browser smoke")) throw new Error("generated React output was not rendered");
'

"${PWCLI[@]}" resize 390 844 >/dev/null
"${PWCLI[@]}" goto "http://127.0.0.1:$REACT_PORT" >/dev/null
REACT_MOBILE=""
for _ in $(seq 1 100); do
  REACT_MOBILE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ listMode: document.querySelector('.service-layout')?.classList.contains('show-mobile-list'), rail: document.querySelector('.offering-rail') ? getComputedStyle(document.querySelector('.offering-rail')).display : '', workspace: document.querySelector('.offering-workspace') ? getComputedStyle(document.querySelector('.offering-workspace')).display : '', sticky: document.querySelector('.run-actions') ? getComputedStyle(document.querySelector('.run-actions')).position : '' })")"
  if [[ "$REACT_MOBILE" == *'\"listMode\":true'* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$REACT_MOBILE" >react-mobile.json
bun -e '
  let state = JSON.parse(await Bun.file("react-mobile.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (!state.listMode || state.rail === "none") throw new Error("generated React mobile list was not shown first");
  if (state.workspace !== "none") throw new Error("generated React mobile workspace should drill in");
  if (state.sticky !== "sticky") throw new Error("generated React mobile actions are not sticky");
'
"${PWCLI[@]}" press Tab >/dev/null
"${PWCLI[@]}" press Enter >/dev/null
REACT_MOBILE_WORKSPACE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspace: getComputedStyle(document.querySelector('.offering-workspace')).display, focused: document.activeElement?.matches('.offering-workspace h2') === true })")"
printf '%s\n' "$REACT_MOBILE_WORKSPACE" >react-mobile-workspace.json
bun -e '
  let state = JSON.parse(await Bun.file("react-mobile-workspace.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.rail !== "none" || state.workspace === "none") throw new Error("generated React mobile drill-in failed");
  if (!state.focused) throw new Error("generated React mobile focus did not enter the workspace");
'

CONSOLE_ERRORS="$("${PWCLI[@]}" --raw console error)"
printf '%s\n' "$CONSOLE_ERRORS" >console-errors.log
if [[ -n "$CONSOLE_ERRORS" && "$CONSOLE_ERRORS" != *"Errors: 0"* ]]; then
  echo "Browser console errors detected:" >&2
  echo "$CONSOLE_ERRORS" >&2
  exit 1
fi

echo "verified portable and generated React service UIs in Chromium"
