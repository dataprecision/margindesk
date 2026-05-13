#!/usr/bin/env bash
# Nightly Zoho People delta sync — pulls only records modified in the last 48h.
# Wired into cron at 1 AM IST (30 19 * * * UTC). See README or git history.

set -uo pipefail

APP_DIR="/home/ubuntu/margindesk/frontend"
BASE_URL="http://127.0.0.1:3000"
LOG_FILE="/var/log/margindesk-sync.log"
SINCE_HOURS=48

# Load CRON_SECRET from the app's .env (avoid hard-coding the secret in this script).
if [[ ! -r "$APP_DIR/.env" ]]; then
  echo "[$(date -Is)] FATAL: cannot read $APP_DIR/.env" >&2
  exit 1
fi
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"')"
if [[ -z "$CRON_SECRET" ]]; then
  echo "[$(date -Is)] FATAL: CRON_SECRET not set in $APP_DIR/.env" >&2
  exit 1
fi

log() {
  echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"
}

# Run one sync step and log the HTTP status + a short body excerpt.
# Always returns 0 so a single failed step doesn't abort the run.
run_sync() {
  local label="$1" sync_type="$2"
  local body status
  body="$(mktemp)"
  status=$(curl -sS -o "$body" -w '%{http_code}' \
    -X POST "$BASE_URL/api/sync/zoho-people?since_hours=$SINCE_HOURS" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 600 \
    -d "{\"syncType\":\"$sync_type\"}")
  if [[ "$status" == "200" ]]; then
    log "$label OK (since_hours=$SINCE_HOURS): $(head -c 400 "$body")"
  else
    log "$label FAILED (HTTP $status): $(head -c 600 "$body")"
  fi
  rm -f "$body"
}

log "=== Nightly sync started ==="
run_sync "employees" "employees"
run_sync "leaves"    "leaves"
log "=== Nightly sync finished ==="
