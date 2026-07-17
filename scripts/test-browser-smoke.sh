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

cleanup() {
  "${PWCLI[@]}" snapshot >"$ARTIFACT_DIR/final-snapshot.log" 2>&1 || true
  "${PWCLI[@]}" screenshot >"$ARTIFACT_DIR/screenshot.log" 2>&1 || true
  "${PWCLI[@]}" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
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
"${PWCLI[@]}" snapshot >snapshot.log
PAGE_STATE=""
for _ in $(seq 1 50); do
  PAGE_STATE="$("${PWCLI[@]}" --raw eval "() => JSON.stringify({ title: document.title, manifest: document.getElementById('manifest-status')?.textContent, echo: document.body.innerText.includes('echo') })")"
  if [[ "$PAGE_STATE" == *"Loaded"* ]]; then
    break
  fi
  sleep 0.1
done
printf '%s\n' "$PAGE_STATE" >page-state.json

bun -e '
  let state = JSON.parse(await Bun.file("page-state.json").text());
  if (typeof state === "string") state = JSON.parse(state);
  if (state.title !== "kitchen-sink-agent") throw new Error("wrong page title");
  if (state.manifest !== "Loaded") throw new Error("manifest did not load");
  if (state.echo !== true) throw new Error("echo entrypoint was not rendered");
'

CONSOLE_ERRORS="$("${PWCLI[@]}" --raw console error)"
printf '%s\n' "$CONSOLE_ERRORS" >console-errors.log
if [[ -n "$CONSOLE_ERRORS" && "$CONSOLE_ERRORS" != *"Errors: 0"* ]]; then
  echo "Browser console errors detected:" >&2
  echo "$CONSOLE_ERRORS" >&2
  exit 1
fi

echo "verified kitchen-sink landing page in Chromium"
