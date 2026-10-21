#!/bin/bash
# Runs docker compose with the right files and the API image, so the same command
# works from deploy.sh, the systemd timers and a person at a shell:
#
#   ./compose.sh ps
#   ./compose.sh --profile backup run --rm backup
#
# The compose file refuses to load without API_IMAGE (even for services that do
# not use it), so it is filled in here from the last deployed tag unless the
# caller already set it, which is how deploy.sh points at a new or old image.
set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=/dev/null
[ -f deploy.conf ] && . ./deploy.conf

if [ -z "${API_IMAGE:-}" ] && [ -f .current-tag ]; then
  : "${ECR_REPO_URI:?ECR_REPO_URI must be set in deploy.conf}"
  API_IMAGE="$ECR_REPO_URI:$(cat .current-tag)"
  export API_IMAGE
fi

# COMPOSE_FILES lets the local rehearsal add an override file.
files=()
for file in ${COMPOSE_FILES:-docker-compose.prod.yml}; do
  files+=(-f "$file")
done

exec docker compose "${files[@]}" "$@"
