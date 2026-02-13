#!/usr/bin/env bash
set -euo pipefail

PORT="${SMOKE_PORT:-9000}"
WORKSPACE_PATH="${WORKSPACE_PATH:-$HOME/.openclaw/workspace}"
TMUX_SOCKET="${TMUX_SOCKET:-/tmp/openclaw-coding-agents.sock}"
BASE_URL="http://127.0.0.1:${PORT}"

TMP_DIR="$(mktemp -d)"
SERVER_LOG="${TMP_DIR}/server.log"
SMOKE_ID="smoke-$(date +%s)-$$"
SMOKE_AGENT="agent-${SMOKE_ID}"
SMOKE_ARTIFACT="${WORKSPACE_PATH}/memory/${SMOKE_ID}.md"
SMOKE_DOC="${WORKSPACE_PATH}/docs/research/${SMOKE_ID}.md"
SMOKE_UPLOAD="${TMP_DIR}/${SMOKE_ID}.txt"
SMOKE_RUN_FILE="${WORKSPACE_PATH}/state/runs/${SMOKE_ID}.json"
SMOKE_RESULT_FILE="${WORKSPACE_PATH}/state/results/${SMOKE_ID}.json"

SERVER_PID=""
FAILURES=0
TESTS=0

log() {
  printf '%s\n' "$*"
}

pass() {
  TESTS=$((TESTS + 1))
  log "PASS: $*"
}

fail() {
  TESTS=$((TESTS + 1))
  FAILURES=$((FAILURES + 1))
  log "FAIL: $*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 2
  fi
}

cleanup() {
  set +e

  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1
    wait "${SERVER_PID}" >/dev/null 2>&1
  fi

  tmux -S "${TMUX_SOCKET}" kill-session -t "${SMOKE_AGENT}" >/dev/null 2>&1 || true

  rm -f "${SMOKE_ARTIFACT}" "${SMOKE_DOC}" "${SMOKE_RUN_FILE}" "${SMOKE_RESULT_FILE}"
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

require_cmd curl
require_cmd jq
require_cmd node
require_cmd tmux

mkdir -p "${WORKSPACE_PATH}/memory" "${WORKSPACE_PATH}/docs/research" "${WORKSPACE_PATH}/state/runs" "${WORKSPACE_PATH}/state/results"

cat > "${SMOKE_ARTIFACT}" <<ART
# ${SMOKE_ID} Artifact

Smoke test artifact file.
ART

cat > "${SMOKE_DOC}" <<DOC
# ${SMOKE_ID} Doc

Smoke test docs file.
DOC

cat > "${SMOKE_UPLOAD}" <<UP
smoke upload payload ${SMOKE_ID}
UP

cat > "${SMOKE_RUN_FILE}" <<RUN
{
  "bead": "${SMOKE_ID}",
  "agent": "smoke",
  "model": "gpt-5",
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "finished_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "duration_seconds": 1,
  "exit_code": 0,
  "attempt": 1,
  "max_retries": 1
}
RUN

cat > "${SMOKE_RESULT_FILE}" <<RESULT
{
  "bead": "${SMOKE_ID}",
  "status": "done",
  "verification": {
    "lint": "pass",
    "tests": "pass"
  }
}
RESULT

# Ensure at least one agent session exists on the shared socket.
if tmux -S "${TMUX_SOCKET}" new-session -d -s "${SMOKE_AGENT}" "printf 'smoke output ${SMOKE_ID}\n'; sleep 300" >/dev/null 2>&1; then
  pass "Created temporary tmux agent session"
else
  fail "Could not create temporary tmux agent session on ${TMUX_SOCKET}"
fi

# Restart app from a clean process state.
pkill -f "node server.js" >/dev/null 2>&1 || true
PORT="${PORT}" WORKSPACE_PATH="${WORKSPACE_PATH}" node server.js >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

# Wait for health endpoint.
for _ in {1..60}; do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
  log "Server failed to start. Log follows:"
  sed -n '1,200p' "${SERVER_LOG}" || true
  exit 1
fi

# API checks
if [[ "$(curl -fsS "${BASE_URL}/api/health" | jq -r '.status')" == "ok" ]]; then
  pass "/api/health returns ok"
else
  fail "/api/health did not return ok"
fi

status_json="$(curl -fsS "${BASE_URL}/api/status")"
if echo "${status_json}" | jq -e '.athena and .agents and .beads and .ralph' >/dev/null; then
  pass "/api/status returns aggregate payload"
else
  fail "/api/status payload missing required fields"
fi

agents_json="$(curl -fsS "${BASE_URL}/api/agents")"
agents_count="$(echo "${agents_json}" | jq 'length')"
if [[ "${agents_count}" -gt 0 ]]; then
  pass "/api/agents returns non-empty array"
else
  fail "/api/agents returned empty array"
fi

if echo "${agents_json}" | jq -e '.[0] | has("name") and has("status") and has("lastOutput")' >/dev/null 2>&1; then
  pass "/api/agents includes required fields"
else
  fail "/api/agents objects missing expected fields"
fi

first_agent="$(echo "${agents_json}" | jq -r '.[0].name // empty')"
if [[ -n "${first_agent}" ]]; then
  agent_output="$(curl -fsS "${BASE_URL}/api/agents/${first_agent}/output")"
  if echo "${agent_output}" | jq -e '.name and .output != null' >/dev/null; then
    pass "/api/agents/:name/output returns pane content"
  else
    fail "/api/agents/:name/output did not return expected payload"
  fi
else
  fail "Could not resolve first agent name"
fi

beads_json="$(curl -fsS "${BASE_URL}/api/beads")"
beads_count="$(echo "${beads_json}" | jq 'length')"
if [[ "${beads_count}" -gt 0 ]]; then
  pass "/api/beads returns non-empty array"
else
  fail "/api/beads returned empty array"
fi

if echo "${beads_json}" | jq -e '.[0] | has("title") and has("priority") and has("status")' >/dev/null 2>&1; then
  pass "/api/beads includes status, priority, title"
else
  fail "/api/beads objects missing status/priority/title"
fi

artifacts_json="$(curl -fsS "${BASE_URL}/api/artifacts")"
artifacts_count="$(echo "${artifacts_json}" | jq '.artifacts | length')"
if [[ "${artifacts_count}" -gt 0 ]]; then
  pass "/api/artifacts returns non-empty artifacts list"
else
  fail "/api/artifacts returned empty artifacts list"
fi

artifact_path="$(echo "${artifacts_json}" | jq -r --arg name "${SMOKE_ID}.md" '.artifacts[] | select(.basename == $name) | .encodedPath' | head -n1)"
if [[ -n "${artifact_path}" ]]; then
  artifact_doc="$(curl -fsS "${BASE_URL}/api/artifacts/${artifact_path}")"
  if echo "${artifact_doc}" | jq -e '.content | contains("Smoke test artifact file")' >/dev/null; then
    pass "/api/artifacts/:path renders markdown artifact"
  else
    fail "/api/artifacts/:path content validation failed"
  fi
else
  fail "Could not find smoke artifact in /api/artifacts output"
fi

text_response="$(curl -fsS -X POST "${BASE_URL}/api/inbox/text" -H 'Content-Type: application/json' -d "{\"content\":\"smoke text ${SMOKE_ID}\"}")"
if echo "${text_response}" | jq -e '.saved == true and .filename' >/dev/null; then
  pass "POST /api/inbox/text saves text"
else
  fail "POST /api/inbox/text failed"
fi

upload_response="$(curl -fsS -X POST "${BASE_URL}/api/inbox/upload" -F "file=@${SMOKE_UPLOAD};type=text/plain")"
upload_name="$(echo "${upload_response}" | jq -r '.filename // empty')"
if [[ -n "${upload_name}" ]]; then
  pass "POST /api/inbox/upload saves file"
else
  fail "POST /api/inbox/upload failed"
fi

inbox_json="$(curl -fsS "${BASE_URL}/api/inbox")"
inbox_count="$(echo "${inbox_json}" | jq '.items | length')"
if [[ "${inbox_count}" -gt 0 ]]; then
  pass "GET /api/inbox returns non-empty inbox list"
else
  fail "GET /api/inbox returned empty items"
fi

if [[ -n "${upload_name}" ]] && echo "${inbox_json}" | jq -e --arg n "${upload_name}" '.items[] | select(.name == $n)' >/dev/null; then
  pass "GET /api/inbox includes uploaded file"
else
  fail "Uploaded file not found in /api/inbox"
fi

runs_json="$(curl -fsS "${BASE_URL}/api/runs")"
runs_count="$(echo "${runs_json}" | jq 'length')"
if [[ "${runs_count}" -gt 0 ]]; then
  pass "/api/runs returns non-empty run history"
else
  fail "/api/runs returned empty array"
fi

if echo "${runs_json}" | jq -e '.[0] | has("bead") and has("started_at")' >/dev/null 2>&1; then
  pass "/api/runs includes run details"
else
  fail "/api/runs payload missing expected fields"
fi

docs_json="$(curl -fsS "${BASE_URL}/api/docs")"
if echo "${docs_json}" | jq -e '.tree | length > 0' >/dev/null; then
  pass "/api/docs returns workspace tree"
else
  fail "/api/docs returned empty tree"
fi

doc_read="$(curl -fsS "${BASE_URL}/api/docs/docs/research/${SMOKE_ID}.md")"
if echo "${doc_read}" | jq -e '.content | contains("Smoke test docs file")' >/dev/null; then
  pass "/api/docs/:path reads markdown file"
else
  fail "/api/docs/:path read failed"
fi

sse_chunk="$(timeout 5s curl -NsS "${BASE_URL}/api/stream" | head -n 2 || true)"
if grep -q 'event: connected' <<<"${sse_chunk}"; then
  pass "/api/stream emits SSE connection event"
else
  fail "/api/stream did not emit expected SSE event"
fi

status_agents_total="$(echo "${status_json}" | jq '.agents.total')"
if [[ "${status_agents_total}" -eq "${agents_count}" ]]; then
  pass "Oracle agents count matches /api/agents"
else
  fail "Oracle agents count mismatch (status=${status_agents_total}, agents=${agents_count})"
fi

status_beads_total="$(echo "${status_json}" | jq '.beads.total // (.beads.todo + .beads.active + .beads.done + .beads.failed)')"
if [[ "${status_beads_total}" -eq "${beads_count}" ]]; then
  pass "Oracle beads count matches /api/beads"
else
  fail "Oracle beads count mismatch (status=${status_beads_total}, beads=${beads_count})"
fi

log ""
log "Tests run: ${TESTS}"
log "Failures: ${FAILURES}"

if [[ "${FAILURES}" -gt 0 ]]; then
  log "Smoke test FAILED"
  exit 1
fi

log "Smoke test PASSED"
