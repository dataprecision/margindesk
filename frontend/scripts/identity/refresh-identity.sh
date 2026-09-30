#!/usr/bin/env bash
# Every-15-days identity refresh (cron: 1st and 16th of the month):
#   1. read-only snapshot of Microsoft 365 + Zoho People,
#   2. additive rebuild of the PersonIdentifier lookup (never deletes),
#   3. dry-run of the reconciliation merge — anything pending is only
#      reported here, never applied automatically.
# Output goes to /var/log/margindesk-identity.log and the snapshot folder.

set -uo pipefail

APP_DIR="/home/ubuntu/margindesk/frontend"
SNAP_ROOT="/home/ubuntu/identity-snapshots"
LOG_FILE="/var/log/margindesk-identity.log"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"; }

cd "$APP_DIR" || { log "FATAL: cannot cd to $APP_DIR"; exit 1; }
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"

log "=== Identity refresh started ==="
snap_out="$(node scripts/identity/refresh-identity-snapshot.mjs "$SNAP_ROOT" 2>&1)"
status=$?
echo "$snap_out" >> "$LOG_FILE"
if [[ $status -ne 0 ]]; then log "Snapshot FAILED — lookup not rebuilt"; exit 1; fi
snap_dir="$(echo "$snap_out" | sed -n 's/^SNAPSHOT_DIR=//p' | tail -1)"

build_out="$(node scripts/identity/build-person-identifiers.mjs "$snap_dir" --out "$snap_dir/build" --apply --allow-prod 2>&1)"
status=$?
echo "$build_out" | sed -n '/== Lookup/,$p' >> "$LOG_FILE"
if [[ $status -ne 0 ]]; then log "Lookup build FAILED"; exit 1; fi

merge_out="$(node scripts/identity/apply-identity-merge.mjs --sync-exits "$snap_dir/zoho_employees.json" 2>&1)"
echo "$merge_out" | sed -n '3,20p' >> "$LOG_FILE"
if echo "$merge_out" | grep -qE '^Timesheet moves: [1-9]|will be emptied and deleted, [1-9]|^Missed exits to apply from Zoho: [1-9]'; then
  log "ATTENTION: reconciliation work pending (see dry run above) — review and apply manually"
else
  log "Nothing pending — all people reconciled"
fi
log "=== Identity refresh finished ($snap_dir) ==="
