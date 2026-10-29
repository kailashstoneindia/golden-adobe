#!/bin/bash
# Writes /opt/golden-abode/.env from SSM Parameter Store (decision 0032), so
# secrets live in one encrypted place and never in git, CI or an image:
#
#   ./render-env.sh [output-file]
#
# Every parameter under $SSM_PREFIX becomes KEY=VALUE, named by the last segment
# of its path (/golden-abode/prod/DB_PASS -> DB_PASS). The instance role supplies
# credentials. It fails, writing nothing, if a required value is missing.
set -euo pipefail

PREFIX="${SSM_PREFIX:?SSM_PREFIX is required, e.g. /golden-abode/prod/}"
OUT="${1:-/opt/golden-abode/.env}"

# Without every one of these the stack would start half-configured.
REQUIRED=(
  API_DOMAIN ACME_EMAIL AWS_REGION
  DB_PASS
  JWT_ACCESS_SECRET JWT_ONBOARDING_SECRET ADMIN_REGISTRATION_SECRET
  MEILI_MASTER_KEY
  S3_MEDIA_BUCKET MEDIA_PUBLIC_BASE_URL MEDIA_CALLBACK_SECRET
  BACKUP_BUCKET
)

umask 077
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# One jq expression writes the KEY=VALUE lines directly. (Not @tsv: it escapes
# backslashes, which would silently corrupt a secret that contains one.) A value
# with a newline would become two env lines, so that is an error, not a guess.
aws ssm get-parameters-by-path \
  --path "$PREFIX" \
  --with-decryption \
  --recursive \
  --output json |
  jq -r '.Parameters[]
         | if (.Value | contains("\n"))
             then error("the value of \(.Name) contains a newline")
             else "\(.Name | split("/") | last)=\(.Value)"
           end' >"$tmp"

missing=()
for name in "${REQUIRED[@]}"; do
  grep -q "^${name}=." "$tmp" || missing+=("$name")
done
if ((${#missing[@]} > 0)); then
  echo "missing or empty in SSM under $PREFIX: ${missing[*]}" >&2
  exit 1
fi

# mv is atomic, so a running stack never sees a half-written file.
chmod 600 "$tmp"
mv "$tmp" "$OUT"
echo "wrote $OUT ($(wc -l <"$OUT") values)"
