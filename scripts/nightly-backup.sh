#!/usr/bin/env bash
# Nightly backup of the MarginDesk production database, before the nightly
# syncs run. Keeps the last 15 daily dumps in ~/backups/daily; the named
# pre-change dumps in ~/backups are never touched.
set -uo pipefail
APP_DIR="/home/ubuntu/margindesk/frontend"
OUT_DIR="/home/ubuntu/backups/daily"
LOG_FILE="/var/log/margindesk-backup.log"
KEEP=15
log() { echo "[$(date -Is)] $*" | tee -a "$LOG_FILE"; }
mkdir -p "$OUT_DIR"
PGURL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | sed 's/?.*//')"
[[ -z "$PGURL" ]] && { log "FATAL: DATABASE_URL not found"; exit 1; }
FILE="$OUT_DIR/margindesk_prod_daily_$(date +%Y%m%d).dump"
if pg_dump -Fc "$PGURL" -f "$FILE.part" && pg_restore --list "$FILE.part" > /dev/null 2>&1; then
  mv "$FILE.part" "$FILE"
  log "OK $FILE ($(du -h "$FILE" | cut -f1))"
else
  rm -f "$FILE.part"
  log "FAILED: dump or verification failed"
  exit 1
fi
# Keep only the newest $KEEP daily dumps.
ls -1t "$OUT_DIR"/margindesk_prod_daily_*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" && log "removed $old"; done
