#!/bin/sh
# Restores a backup into a database of your choosing (decision 0032):
#
#   pg-restore.sh --latest --target-db golden_abode_restore_check
#   pg-restore.sh --key postgres/2026/10/05/golden_abode-20261005T210000Z.dump --target-db NAME
#
# Run it as a drill every month, into a throwaway database, so the first time
# anyone restores is not during an outage. It REFUSES to touch the live database
# (PGDATABASE) unless --force is given, and it prints row counts for the
# database it restored next to the live one so the result can be eyeballed.
#
# Needs the standard PG* variables and BACKUP_BUCKET (and BACKUP_S3_ENDPOINT for
# MinIO), like pg-backup.sh.
set -eu

usage() {
  cat >&2 <<'EOF'
usage: pg-restore.sh (--latest | --key KEY) --target-db NAME [--force]

  --latest         restore the newest successful backup
  --key KEY        restore a specific object (as listed in the bucket)
  --target-db NAME database to restore INTO (created; dropped first with --force)
  --force          allow replacing an existing database, including the live one
EOF
}

key=""
latest=0
target=""
force=0
while [ $# -gt 0 ]; do
  case "$1" in
    --latest) latest=1 ;;
    --key)
      key="${2:-}"
      shift
      ;;
    --target-db)
      target="${2:-}"
      shift
      ;;
    --force) force=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
  shift
done

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
if [ -z "$target" ] || { [ "$latest" -eq 0 ] && [ -z "$key" ]; }; then
  usage
  exit 2
fi
if [ "$target" = "${PGDATABASE:-}" ] && [ "$force" -ne 1 ]; then
  echo "refusing to restore over the live database '$target' without --force" >&2
  exit 2
fi

endpoint_args=""
if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then endpoint_args="--endpoint-url $BACKUP_S3_ENDPOINT"; fi
# shellcheck disable=SC2086  # endpoint_args is deliberately split into two words
s3() { aws $endpoint_args s3 "$@"; }
# shellcheck disable=SC2086
s3api() { aws $endpoint_args s3api "$@"; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

expected_sha=""
if [ "$latest" -eq 1 ]; then
  s3 cp "s3://$BACKUP_BUCKET/postgres/last-success.json" "$work/last-success.json" --only-show-errors
  key=$(jq -r .key "$work/last-success.json")
  expected_sha=$(jq -r .sha256 "$work/last-success.json")
else
  expected_sha=$(s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" |
    jq -r '.Metadata.sha256 // empty')
fi

echo "downloading s3://$BACKUP_BUCKET/$key"
s3 cp "s3://$BACKUP_BUCKET/$key" "$work/restore.dump" --only-show-errors

if [ -n "$expected_sha" ]; then
  actual_sha=$(sha256sum "$work/restore.dump" | cut -d' ' -f1)
  if [ "$actual_sha" != "$expected_sha" ]; then
    echo "checksum mismatch: expected $expected_sha, got $actual_sha" >&2
    exit 1
  fi
  echo "checksum verified"
else
  echo "warning: no checksum recorded for this backup, skipping verification" >&2
fi

pg_restore --list "$work/restore.dump" >/dev/null

if psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1; then
  if [ "$force" -ne 1 ]; then
    echo "database '$target' already exists; pass --force to replace it" >&2
    exit 2
  fi
  dropdb --if-exists "$target"
fi
createdb "$target"

echo "restoring into $target"
pg_restore --no-owner --no-acl --exit-on-error --dbname="$target" "$work/restore.dump"

count() {
  psql -d "$1" -Atc "
    SELECT CASE WHEN to_regclass('public.$2') IS NULL THEN 'n/a'
      ELSE (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from public.%I', '$2'), false, true, '')))[1]::text
    END"
}

echo
printf '%-20s %12s %12s\n' "table" "restored" "live"
for table in master_product vendor_listing vendors users master_product_media; do
  printf '%-20s %12s %12s\n' "$table" "$(count "$target" "$table")" "$(count "${PGDATABASE:-postgres}" "$table")"
done
echo
echo "restored $key into '$target'. Counts below the live ones are expected if the backup is older."
