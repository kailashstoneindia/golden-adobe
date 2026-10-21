#!/bin/sh
# Dumps the database to S3 (decision 0032). Runs nightly from a systemd timer and
# before every deploy, because migrations run when the container starts.
#
#   s3://$BACKUP_BUCKET/postgres/YYYY/MM/DD/golden_abode-<UTC timestamp>.dump
#   s3://$BACKUP_BUCKET/postgres/last-success.json   (what the restore script reads)
#
# Any failure exits non-zero, so a failed backup is a failed deploy and a failed
# timer, never a silent gap. Credentials come from the instance role, not a key.
#
# Needs the standard PG* variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) and
# BACKUP_BUCKET. Optional: BACKUP_S3_ENDPOINT (MinIO, for local rehearsal) and
# BACKUP_METRIC_ENABLED=true (publishes a CloudWatch metric an alarm watches).
set -eu

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${PGDATABASE:?PGDATABASE is required}"

s3() {
  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 "$@"
  else
    aws s3 "$@"
  fi
}

started=$(date +%s)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
day=$(date -u +%Y/%m/%d)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

dump="$work/golden_abode-$stamp.dump"
key="postgres/$day/golden_abode-$stamp.dump"

echo "dumping $PGDATABASE"
pg_dump --format=custom --compress=6 --file="$dump"

# A dump that cannot be read back is worse than no dump: it looks like a backup.
pg_restore --list "$dump" >/dev/null

sha=$(sha256sum "$dump" | cut -d' ' -f1)
bytes=$(wc -c <"$dump" | tr -d ' ')

echo "uploading $bytes bytes to s3://$BACKUP_BUCKET/$key"
s3 cp "$dump" "s3://$BACKUP_BUCKET/$key" --metadata "sha256=$sha" --only-show-errors

seconds=$(($(date +%s) - started))
jq -n \
  --arg ts "$stamp" \
  --arg key "$key" \
  --arg sha "$sha" \
  --argjson bytes "$bytes" \
  --argjson seconds "$seconds" \
  '{ts: $ts, key: $key, sha256: $sha, bytes: $bytes, durationSec: $seconds}' \
  >"$work/last-success.json"
s3 cp "$work/last-success.json" "s3://$BACKUP_BUCKET/postgres/last-success.json" \
  --content-type application/json --only-show-errors

if [ "${BACKUP_METRIC_ENABLED:-}" = "true" ]; then
  # An alarm on the ABSENCE of this metric is what notices a backup that stopped.
  aws cloudwatch put-metric-data --namespace GoldenAbode/Backup --metric-name Success --value 1
fi

echo "backup complete: $key ($bytes bytes, ${seconds}s, sha256 $sha)"
