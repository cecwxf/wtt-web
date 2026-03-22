#!/usr/bin/env bash
set -euo pipefail

# Smoke test for slash-command routing in WTT Web topic chat.
#
# Required env:
#   WTT_API_BASE   e.g. https://www.waxbyte.com/api/v1
#   WTT_TOKEN      Bearer token (without "Bearer ")
#   TOPIC_ID       target topic id to post test commands
#
# Optional env:
#   TARGET_AGENT_ID  only count replies from this agent
#   HUMAN_SENDER_ID  sender id for smoke messages (default auto)
#   TIMEOUT_SECONDS  per-command timeout (default 60)
#
# Example:
#   WTT_API_BASE=https://www.waxbyte.com/api/v1 \
#   WTT_TOKEN=xxxxx TOPIC_ID=topic-abc TARGET_AGENT_ID=agent-main \
#   bash scripts/smoke-slash.sh

if ! command -v curl >/dev/null 2>&1; then
  echo "[ERR] curl is required" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "[ERR] jq is required" >&2
  exit 1
fi

: "${WTT_API_BASE:?WTT_API_BASE is required}"
: "${WTT_TOKEN:?WTT_TOKEN is required}"
: "${TOPIC_ID:?TOPIC_ID is required}"

TARGET_AGENT_ID="${TARGET_AGENT_ID:-}"
HUMAN_SENDER_ID="${HUMAN_SENDER_ID:-smoke-human-$(date +%s)}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-60}"

API_BASE="${WTT_API_BASE%/}"

commands=(
  "/wtt help"
  "/wtt list"
  "/status"
  "/commands"
  "/model"
)

if [[ -n "${SMOKE_COMMANDS:-}" ]]; then
  # newline separated commands override defaults
  mapfile -t commands <<< "${SMOKE_COMMANDS}"
fi

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "$url" \
      -H "Authorization: Bearer ${WTT_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -fsS -X "$method" "$url" \
      -H "Authorization: Bearer ${WTT_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

send_command() {
  local cmd="$1"
  local body
  body=$(jq -nc \
    --arg content "$cmd" \
    --arg sid "$HUMAN_SENDER_ID" \
    '{content:$content, content_type:"text", semantic_type:"post", sender_type:"HUMAN", sender_id:$sid}')

  request POST "${API_BASE}/topics/${TOPIC_ID}/messages" "$body" >/dev/null
}

fetch_latest_agent_reply_b64() {
  local since_ts="$1"
  request GET "${API_BASE}/topics/${TOPIC_ID}/messages?limit=80" \
  | jq -r \
      --arg since "$since_ts" \
      --arg target "$TARGET_AGENT_ID" '
        map(select(((.timestamp // .created_at // "") > $since)))
        | map(select((((.sender_type // "") | tostring | ascii_downcase) == "agent")))
        | (if ($target|length) > 0 then map(select((.sender_id // "") == $target)) else . end)
        | sort_by(.timestamp // .created_at)
        | last // empty
        | @base64
      '
}

b64_field() {
  local b64="$1"
  local key="$2"
  printf '%s' "$b64" | base64 --decode | jq -r --arg k "$key" '.[$k] // empty'
}

wait_reply() {
  local since_ts="$1"
  local timeout="$2"

  local start now
  start=$(date +%s)

  while true; do
    local row
    row="$(fetch_latest_agent_reply_b64 "$since_ts" || true)"
    if [[ -n "$row" ]]; then
      local rid rsender rts rcontent
      rid="$(b64_field "$row" "message_id")"
      rsender="$(b64_field "$row" "sender_id")"
      rts="$(b64_field "$row" "timestamp")"
      rcontent="$(b64_field "$row" "content")"
      if [[ -n "$rid" && -n "$rcontent" ]]; then
        echo "[OK] reply id=${rid} sender=${rsender} ts=${rts}"
        echo "      ${rcontent:0:120}"
        return 0
      fi
    fi

    now=$(date +%s)
    if (( now - start >= timeout )); then
      return 1
    fi
    sleep 2
  done
}

echo "== WTT Slash Smoke Test =="
echo "API_BASE=${API_BASE}"
echo "TOPIC_ID=${TOPIC_ID}"
echo "TARGET_AGENT_ID=${TARGET_AGENT_ID:-<any-agent>}"
echo "HUMAN_SENDER_ID=${HUMAN_SENDER_ID}"
echo

pass=0
fail=0

for cmd in "${commands[@]}"; do
  [[ -z "$cmd" ]] && continue

  since_ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "--> send: $cmd"

  if ! send_command "$cmd"; then
    echo "[FAIL] send failed: $cmd"
    ((fail+=1))
    continue
  fi

  if wait_reply "$since_ts" "$TIMEOUT_SECONDS"; then
    ((pass+=1))
  else
    echo "[FAIL] no agent reply in ${TIMEOUT_SECONDS}s: $cmd"
    ((fail+=1))
  fi

  echo
  sleep 1
done

echo "== result: pass=${pass}, fail=${fail} =="
if (( fail > 0 )); then
  exit 2
fi
