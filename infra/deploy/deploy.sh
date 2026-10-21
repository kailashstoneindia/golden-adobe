#!/bin/bash
# Deploys one backend image tag to this box (decision 0032):
#
#   /opt/golden-abode/deploy.sh <git-sha>
#
# Run by the deploy workflow through SSM, and by hand to roll forward or back.
#
#   1. renders .env from SSM            (if SSM_PREFIX is set)
#   2. pulls the image from ECR         (if ECR_REGISTRY is set)
#   3. takes a database backup first    (migrations run when the container starts
#                                        and cannot be undone by a rollback)
#   4. replaces ONLY the api container, then waits until it is healthy both inside
#      Docker and through Caddy over HTTPS
#   5. if that fails, puts the previous image back
#
# Expect about 10 to 20 seconds of downtime: there is one api container, and it is
# replaced. Zero-downtime deploys are out of scope for a single small box.
#
# Migrations must be backward-compatible (add first, remove later), because a
# rollback restores the old code against the already-migrated database.
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
cd "$(dirname "$0")"

# shellcheck source=/dev/null
[ -f deploy.conf ] && . ./deploy.conf
: "${ECR_REPO_URI:?ECR_REPO_URI must be set in deploy.conf}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
KEEP_IMAGES="${KEEP_IMAGES:-3}"

# One deploy at a time: two overlapping runs would fight over the same container.
exec 9>.deploy.lock
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || {
    echo "another deploy is already running" >&2
    exit 1
  }
else
  # Always present on the real box (util-linux); missing on some laptops.
  echo "warning: flock is not installed, so overlapping deploys are not prevented" >&2
fi

log() { echo "==> $*"; }
compose() { ./compose.sh "$@"; }

previous_tag=""
[ -f .current-tag ] && previous_tag="$(cat .current-tag)"
export API_IMAGE="$ECR_REPO_URI:$TAG"

if [ -n "${SSM_PREFIX:-}" ]; then
  log "rendering .env from SSM"
  ./render-env.sh
fi

health_url="${HEALTH_URL:-}"
if [ -z "$health_url" ]; then
  api_domain="$(grep -E '^API_DOMAIN=' .env | cut -d= -f2-)"
  health_url="https://$api_domain/health"
fi

# True once the api container reports healthy AND the public URL answers, so a
# broken Caddy or certificate fails the deploy as surely as a broken app.
wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) cid status restarts
  while ((SECONDS < deadline)); do
    cid="$(compose ps -q api)"
    status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)"
    # A container that keeps crashing is dead: no reason to wait out the timeout.
    restarts="$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
    if [ "$restarts" -ge 3 ]; then
      echo "the api container keeps crashing ($restarts restarts)" >&2
      return 1
    fi
    # CURL_OPTS is word-split on purpose (the rehearsal passes -k for its local CA).
    # shellcheck disable=SC2086
    if [ "$status" = healthy ] && curl -fsS ${CURL_OPTS:-} "$health_url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

rollback() {
  log "deploy of $TAG failed; the last lines of the api log:"
  compose logs --tail 60 api || true
  if [ -z "$previous_tag" ]; then
    log "there is no previous version to go back to; leaving it up for inspection"
    exit 1
  fi
  log "rolling back to $previous_tag (database migrations are NOT rolled back)"
  export API_IMAGE="$ECR_REPO_URI:$previous_tag"
  compose up -d --no-deps api
  if wait_healthy; then
    log "rolled back to $previous_tag"
    exit 1
  fi
  log "the rollback is unhealthy too: this needs a person"
  exit 2
}

if [ -n "${ECR_REGISTRY:-}" ]; then
  log "pulling $API_IMAGE"
  aws ecr get-login-password --region "${AWS_REGION:?AWS_REGION must be set in deploy.conf}" |
    docker login --username AWS --password-stdin "$ECR_REGISTRY"
  compose pull api
fi

log "starting the data services"
compose up -d postgres redis meilisearch

if [ -n "$previous_tag" ]; then
  log "backing up the database before migrating"
  compose --profile backup run --rm backup
else
  log "first deploy: nothing to back up yet"
fi

log "starting api $TAG"
compose up -d --no-deps api || rollback
compose up -d caddy

log "waiting for $health_url (up to ${HEALTH_TIMEOUT}s)"
wait_healthy || rollback

echo "$TAG" >.current-tag
log "deployed $TAG"

# Keep the newest few images for quick rollbacks; the rest only fill the disk.
docker images "$ECR_REPO_URI" --format '{{.Tag}}' | tail -n +$((KEEP_IMAGES + 1)) |
  xargs -r -I{} docker rmi "$ECR_REPO_URI:{}" >/dev/null 2>&1 || true
docker image prune -f >/dev/null
