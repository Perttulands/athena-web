#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 <bead-id> <repo-path> <agent-type> <prompt> [template-name]" >&2
    echo "  agent-type: claude | codex" >&2
    echo "  template-name: optional template name (default: custom)" >&2
}

if [[ $# -lt 4 || $# -gt 5 ]]; then
    usage
    exit 1
fi

BEAD_ID="$1"
REPO_PATH="$2"
AGENT_TYPE="$3"
PROMPT="$4"
TEMPLATE_NAME="${5:-custom}"

if [[ "$AGENT_TYPE" != "claude" && "$AGENT_TYPE" != "codex" ]]; then
    echo "Error: agent-type must be 'claude' or 'codex', got '$AGENT_TYPE'" >&2
    exit 1
fi

if [[ ! -d "$REPO_PATH" ]]; then
    echo "Error: repo path does not exist: $REPO_PATH" >&2
    exit 1
fi

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$WORKSPACE_ROOT/state"
RUNS_DIR="$STATE_DIR/runs"
RESULTS_DIR="$STATE_DIR/results"
WATCH_DIR="$STATE_DIR/watch"

TMUX_SOCKET="/tmp/openclaw-coding-agents.sock"
SESSION_NAME="agent-$BEAD_ID"

MAX_RETRIES="${DISPATCH_MAX_RETRIES:-2}"
WATCH_INTERVAL_SECONDS="${DISPATCH_WATCH_INTERVAL_SECONDS:-20}"
WATCH_TIMEOUT_SECONDS="${DISPATCH_WATCH_TIMEOUT_SECONDS:-1800}"
ORPHAN_GRACE_SECONDS="${DISPATCH_ORPHAN_GRACE_SECONDS:-600}"

RUN_RECORD="$RUNS_DIR/$BEAD_ID.json"
RESULT_RECORD="$RESULTS_DIR/$BEAD_ID.json"
STATUS_FILE="$WATCH_DIR/$BEAD_ID.status.json"
PROMPT_FILE="$WATCH_DIR/$BEAD_ID.prompt.txt"
RUNNER_SCRIPT="$WATCH_DIR/$BEAD_ID.runner.sh"

iso_now() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

epoch_now() {
    date -u +%s
}

is_integer() {
    [[ "$1" =~ ^[0-9]+$ ]]
}

status_is_terminal() {
    case "$1" in
        done|failed|timeout) return 0 ;;
        *) return 1 ;;
    esac
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: required command not found: $1" >&2
        exit 1
    fi
}

validate_run_record_file() {
    local file="$1"
    jq -e '
        type == "object" and
        (.schema_version == 1) and
        (.bead | type == "string" and length > 0) and
        (.agent as $a | ["claude", "codex"] | index($a) != null) and
        (.model | type == "string" and length > 0) and
        (.repo | type == "string" and length > 0) and
        (.prompt | type == "string") and
        (.prompt_hash | type == "string" and test("^[a-f0-9]{64}$")) and
        (.started_at | type == "string") and
        ((.finished_at == null) or (.finished_at | type == "string")) and
        ((.duration_seconds == null) or (.duration_seconds | type == "number" and . >= 0 and floor == .)) and
        (.status as $s | ["running", "done", "failed", "timeout"] | index($s) != null) and
        (.attempt | type == "number" and . >= 1 and floor == .) and
        (.max_retries | type == "number" and . >= 1 and floor == .) and
        (.session_name | type == "string" and length > 0) and
        (.result_file | type == "string" and length > 0) and
        ((.exit_code == null) or (.exit_code | type == "number" and floor == .)) and
        ((.output_summary == null) or (.output_summary | type == "string")) and
        ((.failure_reason == null) or (.failure_reason | type == "string")) and
        ((.template_name == null) or (.template_name | type == "string")) and
        (.prompt_full | type == "string")
    ' "$file" >/dev/null
}

validate_result_record_file() {
    local file="$1"
    jq -e '
        type == "object" and
        (.schema_version == 1) and
        (.bead | type == "string" and length > 0) and
        (.agent as $a | ["claude", "codex"] | index($a) != null) and
        (.status as $s | ["running", "done", "failed", "timeout"] | index($s) != null) and
        (.reason | type == "string" and length > 0) and
        (.started_at | type == "string") and
        ((.finished_at == null) or (.finished_at | type == "string")) and
        ((.duration_seconds == null) or (.duration_seconds | type == "number" and . >= 0 and floor == .)) and
        (.attempt | type == "number" and . >= 1 and floor == .) and
        (.max_retries | type == "number" and . >= 1 and floor == .) and
        (.will_retry | type == "boolean") and
        ((.exit_code == null) or (.exit_code | type == "number" and floor == .)) and
        (.session_name | type == "string" and length > 0) and
        ((.output_summary == null) or (.output_summary | type == "string"))
    ' "$file" >/dev/null
}

atomic_write_json() {
    local target="$1"
    local payload="$2"
    local validator="$3"
    local tmp
    tmp="$(mktemp "${target}.tmp.XXXXXX")"
    printf '%s\n' "$payload" > "$tmp"

    if ! jq -e . "$tmp" >/dev/null 2>&1; then
        rm -f "$tmp"
        echo "Error: generated invalid JSON for $target" >&2
        exit 1
    fi

    if ! "$validator" "$tmp"; then
        rm -f "$tmp"
        echo "Error: JSON schema validation failed for $target" >&2
        exit 1
    fi

    mv "$tmp" "$target"
}

build_run_payload() {
    local status="$1"
    local finished_at="$2"
    local duration="$3"
    local exit_code="$4"
    local output_summary="${5:-}"
    local failure_reason="${6:-}"
    local verification="${7:-null}"

    jq -cn \
        --arg bead "$BEAD_ID" \
        --arg agent "$AGENT_TYPE" \
        --arg model "$MODEL" \
        --arg repo "$REPO_PATH" \
        --arg prompt "$PROMPT_TRUNCATED" \
        --arg prompt_hash "$PROMPT_HASH" \
        --arg started_at "$STARTED_AT" \
        --arg finished_at "$finished_at" \
        --arg duration "$duration" \
        --arg status "$status" \
        --arg exit_code "$exit_code" \
        --arg session_name "$SESSION_NAME" \
        --arg result_file "$RESULT_RECORD" \
        --arg output_summary "$output_summary" \
        --arg failure_reason "$failure_reason" \
        --arg template_name "$TEMPLATE_NAME" \
        --arg prompt_full "$PROMPT" \
        --argjson attempt "$ATTEMPT" \
        --argjson max_retries "$MAX_RETRIES" \
        --argjson verification "$verification" \
        '{
            schema_version: 1,
            bead: $bead,
            agent: $agent,
            model: $model,
            repo: $repo,
            prompt: $prompt,
            prompt_hash: $prompt_hash,
            started_at: $started_at,
            finished_at: (if $finished_at == "" then null else $finished_at end),
            duration_seconds: (if $duration == "" then null else ($duration | tonumber) end),
            status: $status,
            attempt: $attempt,
            max_retries: $max_retries,
            session_name: $session_name,
            result_file: $result_file,
            exit_code: (if $exit_code == "" then null else ($exit_code | tonumber) end),
            output_summary: (if $output_summary == "" then null else $output_summary end),
            failure_reason: (if $failure_reason == "" then null else $failure_reason end),
            template_name: (if $template_name == "" then null else $template_name end),
            prompt_full: $prompt_full,
            verification: $verification
        }'
}

write_run_record() {
    local status="$1"
    local finished_at="$2"
    local duration="$3"
    local exit_code="$4"
    local output_summary="${5:-}"
    local failure_reason="${6:-}"
    local verification="${7:-null}"
    local payload

    payload="$(build_run_payload "$status" "$finished_at" "$duration" "$exit_code" "$output_summary" "$failure_reason" "$verification")"
    atomic_write_json "$RUN_RECORD" "$payload" validate_run_record_file
}

build_result_payload() {
    local status="$1"
    local reason="$2"
    local finished_at="$3"
    local duration="$4"
    local exit_code="$5"
    local will_retry="$6"
    local output_summary="${7:-}"
    local verification="${8:-null}"

    jq -cn \
        --arg bead "$BEAD_ID" \
        --arg agent "$AGENT_TYPE" \
        --arg status "$status" \
        --arg reason "$reason" \
        --arg started_at "$STARTED_AT" \
        --arg finished_at "$finished_at" \
        --arg duration "$duration" \
        --arg exit_code "$exit_code" \
        --arg session_name "$SESSION_NAME" \
        --arg output_summary "$output_summary" \
        --argjson attempt "$ATTEMPT" \
        --argjson max_retries "$MAX_RETRIES" \
        --argjson will_retry "$will_retry" \
        --argjson verification "$verification" \
        '{
            schema_version: 1,
            bead: $bead,
            agent: $agent,
            status: $status,
            reason: $reason,
            started_at: $started_at,
            finished_at: (if $finished_at == "" then null else $finished_at end),
            duration_seconds: (if $duration == "" then null else ($duration | tonumber) end),
            attempt: $attempt,
            max_retries: $max_retries,
            will_retry: $will_retry,
            exit_code: (if $exit_code == "" then null else ($exit_code | tonumber) end),
            session_name: $session_name,
            output_summary: (if $output_summary == "" then null else $output_summary end),
            verification: $verification
        }'
}

write_result_record() {
    local status="$1"
    local reason="$2"
    local finished_at="$3"
    local duration="$4"
    local exit_code="$5"
    local will_retry="$6"
    local output_summary="${7:-}"
    local verification="${8:-null}"
    local payload

    payload="$(build_result_payload "$status" "$reason" "$finished_at" "$duration" "$exit_code" "$will_retry" "$output_summary" "$verification")"
    atomic_write_json "$RESULT_RECORD" "$payload" validate_result_record_file
}

append_memory_hook() {
    local status="$1"
    local duration="$2"
    local reason="$3"
    local will_retry="$4"
    local memory_dir="$WORKSPACE_ROOT/memory"
    local memory_file="$memory_dir/$(date -u +%Y-%m-%d).md"

    mkdir -p "$memory_dir"
    if [[ ! -f "$memory_file" ]]; then
        printf '# %s\n\n' "$(date -u +%Y-%m-%d)" > "$memory_file"
    fi

    printf -- "- Bead \`%s\`: agent=%s, attempt=%s/%s, status=%s, duration=%ss, will_retry=%s, reason=%s\n" \
        "$BEAD_ID" "$AGENT_TYPE" "$ATTEMPT" "$MAX_RETRIES" "$status" "$duration" "$will_retry" "$reason" >> "$memory_file"
}

wake_athena() {
    local status="$1"
    local duration="$2"
    local reason="$3"

    if command -v openclaw >/dev/null 2>&1; then
        openclaw cron wake \
            "Agent $BEAD_ID $status (${duration}s, $AGENT_TYPE, attempt $ATTEMPT/$MAX_RETRIES, reason: $reason)" \
            >/dev/null 2>&1 || true
    fi
}

session_exists() {
    tmux -S "$TMUX_SOCKET" has-session -t "$SESSION_NAME" >/dev/null 2>&1
}

cleanup_runtime_files() {
    rm -f "$PROMPT_FILE" "$RUNNER_SCRIPT"
}

cleanup_orphaned_sessions() {
    local sessions
    local now
    now="$(epoch_now)"

    if ! sessions="$(tmux -S "$TMUX_SOCKET" list-sessions -F "#{session_name} #{session_created}" 2>/dev/null)"; then
        return 0
    fi

    while IFS= read -r line; do
        local session
        local created_epoch
        local bead
        local run_file
        local result_file
        local run_status
        local result_status
        local age
        local should_kill=0

        session="$(awk '{print $1}' <<< "$line")"
        created_epoch="$(awk '{print $2}' <<< "$line")"

        [[ -z "$session" || "$session" != agent-* ]] && continue
        bead="${session#agent-}"
        run_file="$RUNS_DIR/$bead.json"
        result_file="$RESULTS_DIR/$bead.json"

        run_status="$(jq -r '.status // ""' "$run_file" 2>/dev/null || true)"
        result_status="$(jq -r '.status // ""' "$result_file" 2>/dev/null || true)"

        if status_is_terminal "$result_status" || status_is_terminal "$run_status"; then
            should_kill=1
        elif [[ ! -f "$run_file" ]]; then
            if is_integer "$created_epoch"; then
                age=$((now - created_epoch))
                if (( age > ORPHAN_GRACE_SECONDS )); then
                    should_kill=1
                fi
            fi
        fi

        if (( should_kill == 1 )); then
            tmux -S "$TMUX_SOCKET" kill-session -t "$session" >/dev/null 2>&1 || true
        fi
    done <<< "$sessions"
}

next_attempt() {
    local previous_attempt=0
    if [[ -f "$RUN_RECORD" ]]; then
        previous_attempt="$(jq -r '.attempt // 0' "$RUN_RECORD" 2>/dev/null || echo 0)"
    fi
    if ! is_integer "$previous_attempt"; then
        previous_attempt=0
    fi
    echo $((previous_attempt + 1))
}

is_shell_prompt_line() {
    local line="$1"
    [[ "$line" =~ ^[#$%][[:space:]]?$ ]] && return 0
    [[ "$line" =~ ^[^[:space:]@]+@[^[:space:]]+:[^$#%]*[#$][[:space:]]?$ ]] && return 0
    [[ "$line" =~ ^(bash|zsh|sh|fish)[^[:space:]]*[#$%][[:space:]]?$ ]] && return 0
    [[ "$line" =~ [[:space:]][#$%][[:space:]]?$ ]] && return 0
    return 1
}

DETECTED_STATUS=""
DETECTED_EXIT_CODE=""
DETECTED_REASON=""
DETECTED_FINISHED_AT=""

set_detection() {
    DETECTED_STATUS="$1"
    DETECTED_EXIT_CODE="$2"
    DETECTED_REASON="$3"
    DETECTED_FINISHED_AT="$4"
}

detect_from_status_file() {
    local exit_code
    local finished_at
    if [[ ! -f "$STATUS_FILE" ]]; then
        return 1
    fi

    if ! jq -e '
        type == "object" and
        (.exit_code | type == "number" and floor == .) and
        (.finished_at | type == "string" and length > 0)
    ' "$STATUS_FILE" >/dev/null 2>&1; then
        return 1
    fi

    exit_code="$(jq -r '.exit_code' "$STATUS_FILE")"
    finished_at="$(jq -r '.finished_at' "$STATUS_FILE")"

    if [[ "$exit_code" == "0" ]]; then
        set_detection "done" "0" "status-file" "$finished_at"
    else
        set_detection "failed" "$exit_code" "status-file" "$finished_at"
    fi

    return 0
}

detect_from_pane_markers() {
    local pane="$1"
    local exit_code
    local finished_at

    exit_code="$(printf '%s\n' "$pane" | sed -n 's/^OPENCLAW_EXIT_CODE:\([0-9]\+\)$/\1/p' | tail -1)"
    finished_at="$(printf '%s\n' "$pane" | sed -n 's/^OPENCLAW_FINISHED_AT:\(.*\)$/\1/p' | tail -1)"

    if [[ -z "$exit_code" ]]; then
        return 1
    fi
    if [[ -z "$finished_at" ]]; then
        finished_at="$(iso_now)"
    fi

    if [[ "$exit_code" == "0" ]]; then
        set_detection "done" "0" "pane-marker" "$finished_at"
    else
        set_detection "failed" "$exit_code" "pane-marker" "$finished_at"
    fi

    return 0
}

detect_from_prompt_heuristic() {
    local pane="$1"
    local last_non_empty

    last_non_empty="$(printf '%s\n' "$pane" | awk 'NF {line=$0} END {print line}')"
    if [[ -z "$last_non_empty" ]]; then
        return 1
    fi

    if is_shell_prompt_line "$last_non_empty"; then
        set_detection "done" "0" "prompt-heuristic" "$(iso_now)"
        return 0
    fi

    return 1
}

detect_completion() {
    local pane

    if detect_from_status_file; then
        return 0
    fi

    if session_exists; then
        pane="$(tmux -S "$TMUX_SOCKET" capture-pane -t "$SESSION_NAME" -p -S -300 2>/dev/null || true)"
        if detect_from_pane_markers "$pane"; then
            return 0
        fi
        if detect_from_prompt_heuristic "$pane"; then
            return 0
        fi
        return 1
    fi

    if detect_from_status_file; then
        return 0
    fi

    set_detection "failed" "127" "session-exited-without-markers" "$(iso_now)"
    return 0
}

complete_run() {
    local status="$1"
    local exit_code="$2"
    local reason="$3"
    local finished_at="$4"
    local duration
    local now
    local will_retry="false"
    local output_summary=""
    local failure_reason=""

    now="$(epoch_now)"
    duration=$((now - STARTED_EPOCH))
    if (( duration < 0 )); then
        duration=0
    fi

    if [[ -z "$finished_at" ]]; then
        finished_at="$(iso_now)"
    fi

    if [[ "$status" != "done" && "$ATTEMPT" -lt "$MAX_RETRIES" ]]; then
        will_retry="true"
    fi

    # Capture last 500 chars of tmux pane output as output_summary
    if session_exists; then
        output_summary="$(tmux -S "$TMUX_SOCKET" capture-pane -t "$SESSION_NAME" -p -S -500 2>/dev/null | tail -c 500 || true)"
    fi

    # Set failure_reason for failed/timeout statuses
    if [[ "$status" == "failed" || "$status" == "timeout" ]]; then
        failure_reason="$reason"
    fi

    # Run verification before writing records
    local verification_json="null"
    if [[ -x "$WORKSPACE_ROOT/scripts/verify.sh" ]]; then
        verification_json="$(
            "$WORKSPACE_ROOT/scripts/verify.sh" "$REPO_PATH" "$BEAD_ID" 2>/dev/null | \
            jq '.checks' 2>/dev/null || echo 'null'
        )"
    fi

    write_run_record "$status" "$finished_at" "$duration" "$exit_code" "$output_summary" "$failure_reason" "$verification_json"
    write_result_record "$status" "$reason" "$finished_at" "$duration" "$exit_code" "$will_retry" "$output_summary" "$verification_json"

    # Advisory schema validation
    if [[ -x "$WORKSPACE_ROOT/scripts/validate-state.sh" ]]; then
        if ! "$WORKSPACE_ROOT/scripts/validate-state.sh" --runs "$RUNS_DIR/$BEAD_ID.json" --results "$RESULTS_DIR/$BEAD_ID.json" 2>/dev/null; then
            echo "Warning: schema validation failed for $BEAD_ID records" >&2
        fi
    fi

    if session_exists; then
        tmux -S "$TMUX_SOCKET" kill-session -t "$SESSION_NAME" >/dev/null 2>&1 || true
    fi
    cleanup_runtime_files
    cleanup_orphaned_sessions
    append_memory_hook "$status" "$duration" "$reason" "$will_retry"
    wake_athena "$status" "$duration" "$reason"
}

launch_watcher() {
    (
        set -euo pipefail
        local deadline
        deadline=$((STARTED_EPOCH + WATCH_TIMEOUT_SECONDS))

        while true; do
            if detect_completion; then
                complete_run "$DETECTED_STATUS" "$DETECTED_EXIT_CODE" "$DETECTED_REASON" "$DETECTED_FINISHED_AT"
                exit 0
            fi

            if (( $(epoch_now) >= deadline )); then
                complete_run "timeout" "" "watch-timeout-${WATCH_TIMEOUT_SECONDS}s" "$(iso_now)"
                exit 0
            fi

            sleep "$WATCH_INTERVAL_SECONDS"
        done
    ) >/dev/null 2>&1 &
}

create_runner_script() {
    local cmd_literal
    printf -v cmd_literal '%q ' "${AGENT_CMD[@]}"

    cat > "$RUNNER_SCRIPT" <<EOF
#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE=$(printf '%q' "$STATUS_FILE")
PROMPT_FILE=$(printf '%q' "$PROMPT_FILE")
BEAD_ID=$(printf '%q' "$BEAD_ID")
AGENT_TYPE=$(printf '%q' "$AGENT_TYPE")
AGENT_CMD=($cmd_literal)

emit_status() {
    local exit_code="\$1"
    local finished_at
    local tmp_file
    finished_at="\$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    tmp_file="\${STATUS_FILE}.tmp"
    jq -cn \
        --arg bead "\$BEAD_ID" \
        --arg agent "\$AGENT_TYPE" \
        --arg finished_at "\$finished_at" \
        --argjson exit_code "\$exit_code" \
        '{bead: \$bead, agent: \$agent, finished_at: \$finished_at, exit_code: \$exit_code}' > "\$tmp_file"
    mv "\$tmp_file" "\$STATUS_FILE"
    echo "OPENCLAW_EXIT_CODE:\$exit_code"
    echo "OPENCLAW_FINISHED_AT:\$finished_at"
}

on_exit() {
    local exit_code="\$?"
    set +e
    emit_status "\$exit_code"
}

trap on_exit EXIT
cat "\$PROMPT_FILE" | "\${AGENT_CMD[@]}"
EOF

    chmod +x "$RUNNER_SCRIPT"
}

mkdir -p "$RUNS_DIR" "$RESULTS_DIR" "$WATCH_DIR"

require_cmd jq
require_cmd tmux
require_cmd sha256sum
require_cmd sed
require_cmd awk
require_cmd tail
require_cmd mktemp
require_cmd date

if [[ "$AGENT_TYPE" == "claude" ]]; then
    require_cmd claude
    MODEL="sonnet"
    AGENT_CMD=(claude -p --dangerously-skip-permissions --model sonnet)
else
    require_cmd codex
    MODEL="codex"
    AGENT_CMD=(codex exec --full-auto -)
fi

if ! is_integer "$MAX_RETRIES" || (( MAX_RETRIES < 1 )); then
    echo "Error: DISPATCH_MAX_RETRIES must be an integer >= 1" >&2
    exit 1
fi
if ! is_integer "$WATCH_INTERVAL_SECONDS" || (( WATCH_INTERVAL_SECONDS < 1 )); then
    echo "Error: DISPATCH_WATCH_INTERVAL_SECONDS must be an integer >= 1" >&2
    exit 1
fi
if ! is_integer "$WATCH_TIMEOUT_SECONDS" || (( WATCH_TIMEOUT_SECONDS < 1 )); then
    echo "Error: DISPATCH_WATCH_TIMEOUT_SECONDS must be an integer >= 1" >&2
    exit 1
fi
if ! is_integer "$ORPHAN_GRACE_SECONDS" || (( ORPHAN_GRACE_SECONDS < 60 )); then
    echo "Error: DISPATCH_ORPHAN_GRACE_SECONDS must be an integer >= 60" >&2
    exit 1
fi

if [[ -x "$WORKSPACE_ROOT/scripts/agent-preflight.sh" ]]; then
    "$WORKSPACE_ROOT/scripts/agent-preflight.sh" "$AGENT_TYPE" "$REPO_PATH"
fi

cleanup_orphaned_sessions

if session_exists; then
    result_status="$(jq -r '.status // ""' "$RESULT_RECORD" 2>/dev/null || true)"
    if status_is_terminal "$result_status"; then
        tmux -S "$TMUX_SOCKET" kill-session -t "$SESSION_NAME" >/dev/null 2>&1 || true
    else
        echo "Error: tmux session '$SESSION_NAME' already exists and is active" >&2
        exit 1
    fi
fi

ATTEMPT="$(next_attempt)"
if (( ATTEMPT > MAX_RETRIES )); then
    ATTEMPT="$MAX_RETRIES"
    STARTED_AT="$(iso_now)"
    STARTED_EPOCH="$(epoch_now)"
    PROMPT_TRUNCATED="${PROMPT:0:200}"
    PROMPT_HASH="$(printf '%s' "$PROMPT" | sha256sum | awk '{print $1}')"
    write_run_record "failed" "$STARTED_AT" "0" "1"
    write_result_record "failed" "max-retries-reached" "$STARTED_AT" "0" "1" "false"
    append_memory_hook "failed" "0" "max-retries-reached" "false"
    wake_athena "failed" "0" "max-retries-reached"
    echo "Error: max retries reached for bead '$BEAD_ID' ($MAX_RETRIES)" >&2
    exit 1
fi

STARTED_AT="$(iso_now)"
STARTED_EPOCH="$(epoch_now)"
PROMPT_TRUNCATED="${PROMPT:0:200}"
PROMPT_HASH="$(printf '%s' "$PROMPT" | sha256sum | awk '{print $1}')"

printf '%s' "$PROMPT" > "$PROMPT_FILE"
create_runner_script

write_run_record "running" "" "" ""
write_result_record "running" "dispatched" "" "" "" "false"

echo "Starting agent session: $SESSION_NAME"
echo "Agent: $AGENT_TYPE ($MODEL)"
echo "Repo: $REPO_PATH"
echo "Run record: $RUN_RECORD"
echo "Result record: $RESULT_RECORD"
echo "Attempt: $ATTEMPT/$MAX_RETRIES"

if ! tmux -S "$TMUX_SOCKET" new-session -d -s "$SESSION_NAME" -c "$REPO_PATH" \
    "bash '$RUNNER_SCRIPT'; exec bash"; then
    complete_run "failed" "1" "tmux-launch-failed" "$(iso_now)"
    echo "Error: failed to create tmux session '$SESSION_NAME'" >&2
    exit 1
fi

launch_watcher
WATCHER_PID="$!"

echo "Agent dispatched. Background watcher PID: $WATCHER_PID"
echo "To attach: tmux -S $TMUX_SOCKET attach -t $SESSION_NAME"
