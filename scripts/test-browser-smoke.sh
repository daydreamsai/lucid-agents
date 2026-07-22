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

stop_react_server() {
  if [[ -n "$REACT_SERVER_PID" ]]; then
    kill "$REACT_SERVER_PID" >/dev/null 2>&1 || true
    wait "$REACT_SERVER_PID" >/dev/null 2>&1 || true
    REACT_SERVER_PID=""
  fi
}

cleanup() {
  "${PWCLI[@]}" snapshot >"$ARTIFACT_DIR/final-snapshot.log" 2>&1 || true
  "${PWCLI[@]}" screenshot >"$ARTIFACT_DIR/screenshot.log" 2>&1 || true
  "${PWCLI[@]}" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  stop_react_server
  if [[ -z "$GENERATED_ROOT" && -n "$GENERATED_ROOT_FILE" && -f "$GENERATED_ROOT_FILE" ]]; then
    GENERATED_ROOT="$(tr -d '\n' <"$GENERATED_ROOT_FILE")"
  fi
  if [[ "${BROWSER_SMOKE_KEEP_GENERATED:-false}" == "true" && -n "$GENERATED_ROOT" ]]; then
    echo "kept generated browser projects at $GENERATED_ROOT"
  elif [[ -n "$GENERATED_ROOT" && -d "$GENERATED_ROOT" && "$GENERATED_ROOT" == *"/lucid-generated-e2e-"* ]]; then
    rm -rf "$GENERATED_ROOT"
  fi
}
trap cleanup EXIT

mkdir -p "$ARTIFACT_DIR"
cd "$ARTIFACT_DIR"

# The portable Hono storefront deliberately has no browser runtime. Exercise the
# real kitchen-sink card to catch information loss and accidental interactivity.
PORT="$PORT" \
CLIENT_PORT="$CLIENT_PORT" \
RUN_A2A_DEMO=false \
QUIET=true \
bun run "$REPO_ROOT/packages/examples/src/kitchen-sink/index.ts" \
  >static-server.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 100); do
  if curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null; then
    break
  fi
  sleep 0.1
done
curl --fail --silent "http://127.0.0.1:$PORT/health" >/dev/null

"${PWCLI[@]}" open "http://127.0.0.1:$PORT" >static-open.log
"${PWCLI[@]}" resize 1440 1000 >/dev/null
"${PWCLI[@]}" reload >/dev/null
STATIC_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ title: document.title, identity: document.querySelector('h1')?.textContent, preset: document.querySelector('[data-service-ui-preset]')?.getAttribute('data-service-ui-preset'), mode: document.querySelector('[data-service-ui-mode]')?.getAttribute('data-service-ui-mode'), offerings: document.querySelectorAll('[data-region=operation]').length, details: Boolean(document.querySelector('[data-region=service-details]')), rawCard: Boolean(document.querySelector('[data-region=raw-card]')), scripts: document.scripts.length, controls: document.querySelectorAll('textarea, [data-action], .primary-button').length, columns: getComputedStyle(document.querySelector('.service-layout')).gridTemplateColumns })")"
printf '%s\n' "$STATIC_STATE" >static-state.json
bun -e '
  let state = JSON.parse(await Bun.file("static-state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.title !== "kitchen-sink-agent" || state.identity !== "kitchen-sink-agent") throw new Error("portable identity was not rendered");
  if (state.preset !== "dossier" || state.mode !== "static") throw new Error("portable storefront did not use static Dossier mode");
  if (state.offerings < 6) throw new Error("portable storefront omitted kitchen-sink offerings");
  if (!state.details || !state.rawCard) throw new Error("portable storefront omitted public contract information");
  if (state.scripts !== 0 || state.controls !== 0) throw new Error("portable storefront included a browser runtime or invoke controls");
  if (!state.columns.startsWith("320px")) throw new Error("portable Dossier desktop layout changed unexpectedly");
'

"${PWCLI[@]}" resize 1024 900 >/dev/null
"${PWCLI[@]}" reload >/dev/null
STATIC_TABLET="$("${PWCLI[@]}" --raw eval "() => getComputedStyle(document.querySelector('.service-layout')).gridTemplateColumns")"
printf '%s\n' "$STATIC_TABLET" >static-tablet.txt
if [[ "$STATIC_TABLET" != *"240px"* ]]; then
  echo "portable Dossier tablet rail did not compact to 240px" >&2
  exit 1
fi

"${PWCLI[@]}" resize 390 844 >/dev/null
"${PWCLI[@]}" reload >/dev/null
STATIC_MOBILE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ width: innerWidth, rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspaces: getComputedStyle(document.querySelector('.workspaces')).display, columns: getComputedStyle(document.querySelector('.service-layout')).gridTemplateColumns })")"
printf '%s\n' "$STATIC_MOBILE" >static-mobile.json
bun -e '
  let state = JSON.parse(await Bun.file("static-mobile.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.width !== 390 || state.rail === "none" || state.workspaces === "none") throw new Error("portable mobile information is not readable");
  if (state.columns.split(" ").length !== 1) throw new Error("portable mobile layout did not collapse to one column");
'

kill "$SERVER_PID" >/dev/null 2>&1 || true
wait "$SERVER_PID" >/dev/null 2>&1 || true
SERVER_PID=""

# Generate the three canonical React previews from packed workspaces. The same
# projects are built in the generated-project CI matrix and deployed to previews.
GENERATED_ROOT_FILE="$ARTIFACT_DIR/generated-root.txt"
GENERATED_PROJECT_KEEP=true \
GENERATED_PROJECT_ROOT_FILE="$GENERATED_ROOT_FILE" \
bun run "$REPO_ROOT/scripts/test-generated-project.ts" next all \
  >generated-next-themes.log 2>&1
GENERATED_ROOT="$(tr -d '\n' <"$GENERATED_ROOT_FILE")"

THEMES=(dossier folio console)
SCHEMES=(dark light dark)
CANVASES=("rgb(11, 13, 12)" "rgb(244, 240, 232)" "rgb(7, 17, 26)")

for index in "${!THEMES[@]}"; do
  THEME="${THEMES[$index]}"
  EXPECTED_SCHEME="${SCHEMES[$index]}"
  EXPECTED_CANVAS="${CANVASES[$index]}"
  REACT_PROJECT="$GENERATED_ROOT/generated-next-$THEME"
  REACT_PORT="$((PORT + 2 + index))"

  PORT="$REACT_PORT" bun run --cwd "$REACT_PROJECT" start \
    >"react-$THEME-server.log" 2>&1 &
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
  REACT_STATE=""
  for _ in $(seq 1 30); do
    REACT_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ identity: document.querySelector('h1')?.textContent, preset: document.querySelector('[data-service-ui-preset]')?.getAttribute('data-service-ui-preset'), mode: document.querySelector('[data-service-ui-mode]')?.getAttribute('data-service-ui-mode'), offering: document.querySelector('.offering-title')?.textContent, offerings: document.querySelectorAll('.offering-list button').length, selectedUrl: new URL(location.href).searchParams.get('offering'), workspace: document.querySelector('.offering-workspace h2')?.textContent, provider: document.body.textContent?.includes('Lucid Agents CI'), live: document.querySelector('.run-state')?.getAttribute('aria-live'), scheme: getComputedStyle(document.documentElement).colorScheme, canvas: getComputedStyle(document.body).backgroundColor, details: document.querySelectorAll('.service-details .detail-card').length, specificationLinks: Array.from(document.querySelectorAll('.service-details a')).filter(link => link.textContent === 'Specification').length, rawCard: Boolean(document.querySelector('[data-region=raw-card]')) })")"
    if [[ "$REACT_STATE" == *"$THEME"* ]]; then
      break
    fi
    sleep 0.1
  done
  printf '%s\n' "$REACT_STATE" >"react-$THEME-state.json"
  THEME="$THEME" EXPECTED_SCHEME="$EXPECTED_SCHEME" EXPECTED_CANVAS="$EXPECTED_CANVAS" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-state.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (state.identity !== `generated-next-${theme}`) throw new Error(`${theme} identity was not rendered`);
    if (state.preset !== theme || state.mode !== "interactive") throw new Error(`${theme} preset marker was incorrect`);
    if (state.offering !== "Echo payload" || state.workspace !== "Echo payload" || state.offerings < 6 || state.selectedUrl !== "echo") throw new Error(`${theme} kitchen-sink offerings or URL selection were incomplete`);
    if (!state.provider || state.live !== "polite" || state.details < 7 || state.specificationLinks < 1 || !state.rawCard) throw new Error(`${theme} omitted public or accessible service information`);
    if (state.scheme !== Bun.env.EXPECTED_SCHEME || state.canvas !== Bun.env.EXPECTED_CANVAS) throw new Error(`${theme} design tokens were not applied`);
  '

  DESKTOP_RAIL_FOCUS="false"
  for _ in $(seq 1 8); do
    "${PWCLI[@]}" press Tab >/dev/null
    DESKTOP_RAIL_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-list button') === true")"
    if [[ "$DESKTOP_RAIL_FOCUS" == "true" ]]; then
      break
    fi
  done
  if [[ "$DESKTOP_RAIL_FOCUS" != "true" ]]; then
    echo "$THEME offering rail was not keyboard reachable" >&2
    exit 1
  fi
  "${PWCLI[@]}" press Enter >/dev/null
  DESKTOP_WORKSPACE_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-workspace h2') === true")"
  if [[ "$DESKTOP_WORKSPACE_FOCUS" != "true" ]]; then
    echo "$THEME offering selection did not move focus to the workspace" >&2
    exit 1
  fi

  "${PWCLI[@]}" --raw eval "() => document.querySelectorAll('.offering-list button')[1]?.click()" >/dev/null
  URL_AFTER_SELECTION="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ offering: new URL(location.href).searchParams.get('offering') })")"
  printf '%s\n' "$URL_AFTER_SELECTION" >"react-$THEME-selection.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-selection.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (state.offering !== "summarize") throw new Error(`${theme} offering selection was not written to the URL`);
  '
  "${PWCLI[@]}" --raw eval "() => history.back()" >/dev/null
  HISTORY_STATE=""
  for _ in $(seq 1 30); do
    HISTORY_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ offering: new URL(location.href).searchParams.get('offering'), workspace: document.querySelector('.offering-workspace h2')?.textContent })")"
    if [[ "$HISTORY_STATE" == *'"offering":"echo"'* ]]; then
      break
    fi
    sleep 0.1
  done
  printf '%s\n' "$HISTORY_STATE" >"react-$THEME-history.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-history.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (state.offering !== "echo" || state.workspace !== "Echo payload") throw new Error(`${theme} browser history did not restore the selected offering`);
  '

  "${PWCLI[@]}" --raw eval "() => { const input = document.querySelector('.offering-workspace textarea'); const button = document.querySelector('.offering-workspace .primary-button'); if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) throw new Error('interactive controls missing'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(input, JSON.stringify({ input: { text: '$THEME browser smoke' } })); input.dispatchEvent(new Event('input', { bubbles: true })); button.click(); }" >/dev/null
  REACT_RUN=""
  for _ in $(seq 1 30); do
    REACT_RUN="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ success: document.querySelector('.run-state')?.classList.contains('state-success'), output: document.querySelector('.run-state pre')?.textContent })")"
    if [[ "$REACT_RUN" == *success*true* ]]; then
      break
    fi
    sleep 0.1
  done
  printf '%s\n' "$REACT_RUN" >"react-$THEME-run.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-run.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (!state.success || !state.output?.includes(`${theme} browser smoke`)) throw new Error(`${theme} invocation did not complete`);
  '

  "${PWCLI[@]}" resize 390 844 >/dev/null
  "${PWCLI[@]}" goto "http://127.0.0.1:$REACT_PORT" >/dev/null
  REACT_MOBILE=""
  for _ in $(seq 1 30); do
    REACT_MOBILE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ listMode: document.querySelector('.service-layout')?.classList.contains('show-mobile-list'), rail: document.querySelector('.offering-rail') ? getComputedStyle(document.querySelector('.offering-rail')).display : '', workspace: document.querySelector('.offering-workspace') ? getComputedStyle(document.querySelector('.offering-workspace')).display : '', sticky: document.querySelector('.run-actions') ? getComputedStyle(document.querySelector('.run-actions')).position : '' })")"
    if [[ "$REACT_MOBILE" == *listMode*true* ]]; then
      break
    fi
    sleep 0.1
  done
  printf '%s\n' "$REACT_MOBILE" >"react-$THEME-mobile.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-mobile.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (!state.listMode || state.rail === "none" || state.workspace !== "none") throw new Error(`${theme} mobile drill-in list was incorrect`);
    if (state.sticky !== "sticky") throw new Error(`${theme} mobile actions were not sticky`);
  '
  MOBILE_RAIL_FOCUS="false"
  for _ in $(seq 1 8); do
    "${PWCLI[@]}" press Tab >/dev/null
    MOBILE_RAIL_FOCUS="$("${PWCLI[@]}" --raw eval "() => document.activeElement?.matches('.offering-list button') === true")"
    if [[ "$MOBILE_RAIL_FOCUS" == "true" ]]; then
      break
    fi
  done
  if [[ "$MOBILE_RAIL_FOCUS" != "true" ]]; then
    echo "$THEME mobile offering rail was not keyboard reachable" >&2
    exit 1
  fi
  "${PWCLI[@]}" press Enter >/dev/null
  MOBILE_WORKSPACE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ rail: getComputedStyle(document.querySelector('.offering-rail')).display, workspace: getComputedStyle(document.querySelector('.offering-workspace')).display, focused: document.activeElement?.matches('.offering-workspace h2') === true })")"
  printf '%s\n' "$MOBILE_WORKSPACE" >"react-$THEME-mobile-workspace.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-mobile-workspace.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (state.rail !== "none" || state.workspace === "none" || !state.focused) throw new Error(`${theme} mobile keyboard drill-in failed`);
  '

  "${PWCLI[@]}" snapshot >"react-$THEME-snapshot.log"
  CONSOLE_ERRORS="$("${PWCLI[@]}" --raw console error)"
  printf '%s\n' "$CONSOLE_ERRORS" >"react-$THEME-console-errors.log"
  if [[ -n "$CONSOLE_ERRORS" && "$CONSOLE_ERRORS" != *"Errors: 0"* ]]; then
    echo "Browser console errors detected for $THEME:" >&2
    echo "$CONSOLE_ERRORS" >&2
    exit 1
  fi

  stop_react_server
done

echo "verified static kitchen-sink storefront and all three interactive themes in Chromium"
