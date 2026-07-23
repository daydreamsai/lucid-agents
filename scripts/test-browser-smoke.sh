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

# The portable Hono page has no browser runtime. Verify the real kitchen-sink
# card renders only the endpoint directory and remains contained on mobile.
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
STATIC_STATE="$("${PWCLI[@]}" --raw eval "() => { const table = document.querySelector('.endpoint-table'); const wrap = document.querySelector('.endpoint-table-wrap'); return JSON.stringify({ title: document.title, identity: document.querySelector('h1')?.textContent, preset: document.querySelector('[data-service-ui-preset]')?.getAttribute('data-service-ui-preset'), mode: document.querySelector('[data-service-ui-mode]')?.getAttribute('data-service-ui-mode'), rows: table?.querySelectorAll('tbody tr').length ?? -1, headers: Array.from(table?.querySelectorAll('th') ?? []).map(node => node.textContent?.trim()), paths: Array.from(table?.querySelectorAll('.endpoint-address code') ?? []).map(node => node.textContent?.trim()), payments: Array.from(table?.querySelectorAll('.payment-method') ?? []).map(node => node.textContent?.trim()), prices: Array.from(table?.querySelectorAll('.endpoint-price') ?? []).map(node => node.textContent?.trim()), overflow: wrap ? getComputedStyle(wrap).overflowX : '', scripts: document.scripts.length, controls: document.querySelectorAll('textarea, button, [data-action]').length, rawCard: Boolean(document.querySelector('[data-region=raw-card]')) }) }")"
printf '%s\n' "$STATIC_STATE" >static-state.json
bun -e '
  let state = JSON.parse(await Bun.file("static-state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.title !== "kitchen-sink-agent" || state.identity !== "kitchen-sink-agent") throw new Error("portable identity was not rendered");
  if (state.preset !== "dossier" || state.mode !== "directory") throw new Error("portable endpoint directory markers were incorrect");
  if (state.rows < 6 || state.paths.length !== state.rows || state.payments.length !== state.rows || state.prices.length !== state.rows) throw new Error("portable endpoint rows were incomplete");
  if (state.headers.join("|") !== "Endpoint|Payment method|Price") throw new Error("portable endpoint columns changed unexpectedly");
  if (!state.paths.every(path => path?.startsWith("/")) || !state.prices.includes("Free")) throw new Error("portable endpoint details were incomplete");
  if (state.overflow !== "auto" || state.scripts !== 0 || state.controls !== 0 || state.rawCard) throw new Error("portable page included removed interaction or JSON UI");
'

"${PWCLI[@]}" resize 390 844 >/dev/null
"${PWCLI[@]}" reload >/dev/null
STATIC_MOBILE="$("${PWCLI[@]}" --raw eval "() => { const wrap = document.querySelector('.endpoint-table-wrap'); const table = document.querySelector('.endpoint-table'); return JSON.stringify({ width: innerWidth, rows: table?.querySelectorAll('tbody tr').length ?? -1, overflow: wrap ? getComputedStyle(wrap).overflowX : '', bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableWidth: table?.getBoundingClientRect().width ?? 0 }) }")"
printf '%s\n' "$STATIC_MOBILE" >static-mobile.json
bun -e '
  let state = JSON.parse(await Bun.file("static-mobile.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.width !== 390 || state.rows < 6 || state.overflow !== "auto") throw new Error("portable mobile endpoint table was not readable");
  if (state.bodyOverflow || state.tableWidth < 640) throw new Error("portable mobile endpoint table was not contained by its scroller");
'

kill "$SERVER_PID" >/dev/null 2>&1 || true
wait "$SERVER_PID" >/dev/null 2>&1 || true
SERVER_PID=""

# Generate and launch each canonical React preset. These pages retain the
# framework runtime but expose the same read-only endpoint directory.
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
    REACT_STATE="$("${PWCLI[@]}" --raw eval "() => { const table = document.querySelector('.endpoint-table'); return JSON.stringify({ identity: document.querySelector('h1')?.textContent, preset: document.querySelector('[data-service-ui-preset]')?.getAttribute('data-service-ui-preset'), mode: document.querySelector('[data-service-ui-mode]')?.getAttribute('data-service-ui-mode'), rows: table?.querySelectorAll('tbody tr').length ?? -1, headers: Array.from(table?.querySelectorAll('th') ?? []).map(node => node.textContent?.trim()), methods: Array.from(table?.querySelectorAll('.endpoint-address span') ?? []).map(node => node.textContent?.trim()), paths: Array.from(table?.querySelectorAll('.endpoint-address code') ?? []).map(node => node.textContent?.trim()), payments: Array.from(table?.querySelectorAll('.payment-method') ?? []).map(node => node.textContent?.trim()), prices: Array.from(table?.querySelectorAll('.endpoint-price') ?? []).map(node => node.textContent?.trim()), scheme: getComputedStyle(document.documentElement).colorScheme, canvas: getComputedStyle(document.body).backgroundColor, controls: document.querySelectorAll('textarea, button, [data-action]').length, rawCard: Boolean(document.querySelector('[data-region=raw-card]')) }) }")"
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
    if (state.identity !== `generated-next-${theme}` || state.preset !== theme || state.mode !== "directory") throw new Error(`${theme} endpoint directory markers were incorrect`);
    if (state.rows < 6 || state.paths.length !== state.rows || state.payments.length !== state.rows || state.prices.length !== state.rows) throw new Error(`${theme} endpoint rows were incomplete`);
    if (state.headers.join("|") !== "Endpoint|Payment method|Price" || !state.methods.every(method => method === "POST")) throw new Error(`${theme} endpoint columns or methods changed unexpectedly`);
    if (!state.paths.every(path => path?.startsWith("/")) || !state.prices.includes("Free")) throw new Error(`${theme} endpoint details were incomplete`);
    if (state.controls !== 0 || state.rawCard) throw new Error(`${theme} included removed interaction or JSON UI`);
    if (state.scheme !== Bun.env.EXPECTED_SCHEME || state.canvas !== Bun.env.EXPECTED_CANVAS) throw new Error(`${theme} design tokens were not applied`);
  '

  "${PWCLI[@]}" resize 390 844 >/dev/null
  "${PWCLI[@]}" reload >/dev/null
  REACT_MOBILE="$("${PWCLI[@]}" --raw eval "() => { const wrap = document.querySelector('.endpoint-table-wrap'); const table = document.querySelector('.endpoint-table'); return JSON.stringify({ rows: table?.querySelectorAll('tbody tr').length ?? -1, overflow: wrap ? getComputedStyle(wrap).overflowX : '', bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, tableWidth: table?.getBoundingClientRect().width ?? 0 }) }")"
  printf '%s\n' "$REACT_MOBILE" >"react-$THEME-mobile.json"
  THEME="$THEME" bun -e '
    const theme = Bun.env.THEME;
    let state = JSON.parse(await Bun.file(`react-${theme}-mobile.json`).text());
    if (typeof state === "string") state = JSON.parse(state);
    if (state.rows < 6 || state.overflow !== "auto" || state.bodyOverflow || state.tableWidth < 640) throw new Error(`${theme} mobile endpoint table was not contained by its scroller`);
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

echo "verified static and React endpoint directories across all presets in Chromium"
