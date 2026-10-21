#!/bin/bash
# Rehearses the production stack on a laptop, end to end, with the REAL deploy.sh:
#
#   infra/deploy/rehearse.sh
#
# Needs Docker and the MinIO container from the root docker-compose.yml
# (`docker compose up -d minio`). It builds the backend image, deploys it, takes
# and restores a backup, deploys again, then deploys a deliberately broken image
# to prove the rollback works. Everything runs in a throwaway directory and is
# torn down at the end. Exits non-zero on the first failed check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_SRC="$REPO_ROOT/infra/deploy"
REH_DIR="$DEPLOY_SRC/.rehearsal"
REPO=golden-abode-rehearsal
PASS=0

# Every compose command below (this script's and deploy.sh's) runs under this
# project name, which no other stack uses. Teardown deletes volumes, so it must
# be impossible for it to reach anything that is not the rehearsal's own.
export COMPOSE_PROJECT_NAME=golden-abode-rehearsal

check() {
  # check "description" command...
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS  $what"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $what" >&2
    exit 1
  fi
}

cleanup() {
  if [ -d "$REH_DIR" ]; then
    # Deleting volumes: refuse unless this is unmistakably the rehearsal project.
    # No --remove-orphans, so nothing outside the project's own files is touched.
    if [ "$COMPOSE_PROJECT_NAME" = golden-abode-rehearsal ]; then
      (cd "$REH_DIR" &&
        API_IMAGE="$REPO:cleanup" ./compose.sh --profile backup --profile sweep down -v) >/dev/null 2>&1 || true
    fi
    rm -rf "$REH_DIR"
  fi
}
trap cleanup EXIT

echo "== preparing"
curl -fsS http://localhost:9000/minio/health/live >/dev/null ||
  {
    echo "MinIO is not running: docker compose up -d minio" >&2
    exit 1
  }
cleanup
mkdir -p "$REH_DIR"
cp -r "$DEPLOY_SRC"/{docker-compose.prod.yml,docker-compose.rehearsal.override.yml,Caddyfile,compose.sh,deploy.sh,render-env.sh,backup} "$REH_DIR/"

# The two buckets the rehearsal uses, created the same way as the dev bucket.
for bucket in golden-abode-media-rehearsal golden-abode-backup-rehearsal; do
  S3_MEDIA_BUCKET="$bucket" pnpm --silent --filter @golden-abode/backend storage:init-local >/dev/null
done

cat >"$REH_DIR/.env" <<'ENV'
API_DOMAIN=localhost
ACME_EMAIL=rehearsal@example.com
AWS_REGION=ap-south-1
DB_PASS=rehearsal_db_password
DB_NAME=golden_abode
DB_USER=postgres
JWT_ACCESS_SECRET=rehearsal-jwt-access-secret-0123456789
JWT_ONBOARDING_SECRET=rehearsal-jwt-onboarding-secret-0123456789
ADMIN_REGISTRATION_SECRET=rehearsal-admin-secret-1234
MEILI_MASTER_KEY=rehearsal_meili_master_key_0123456789
S3_MEDIA_BUCKET=golden-abode-media-rehearsal
MEDIA_PUBLIC_BASE_URL=http://localhost:9000/golden-abode-media-rehearsal
MEDIA_CALLBACK_SECRET=rehearsal-callback-secret-0123456789abcdef
BACKUP_BUCKET=golden-abode-backup-rehearsal
ENV

cat >"$REH_DIR/deploy.conf" <<CONF
AWS_REGION=ap-south-1
ECR_REPO_URI=$REPO
HEALTH_URL=https://localhost:18443/health
CURL_OPTS=-k
HEALTH_TIMEOUT=150
COMPOSE_FILES="docker-compose.prod.yml docker-compose.rehearsal.override.yml"
CONF

echo "== building the images"
docker build -q -f "$REPO_ROOT/apps/backend/Dockerfile" -t "$REPO:good-1" "$REPO_ROOT" >/dev/null
docker tag "$REPO:good-1" "$REPO:good-2"
# An image whose server dies straight away, to prove the rollback.
docker build -q -t "$REPO:broken" - >/dev/null <<'DOCKERFILE'
FROM node:22-alpine
ENTRYPOINT ["node", "-e", "setTimeout(() => process.exit(1), 1000)"]
DOCKERFILE

cd "$REH_DIR"

echo "== first deploy (also runs every migration on an empty database)"
./deploy.sh good-1
check "first deploy recorded its tag" test "$(cat .current-tag)" = good-1
check "the API answers through Caddy over HTTPS" curl -fsS -k https://localhost:18443/health
check "the migrations created the media columns" \
  ./compose.sh exec -T postgres psql -U postgres -d golden_abode -Atc \
  "SELECT 1 FROM information_schema.columns WHERE table_name='master_product_media' AND column_name='storage_key'"

echo "== exposure"
for service in postgres redis meilisearch api; do
  published="$(docker port "$(./compose.sh ps -q "$service")" 2>/dev/null || true)"
  check "$service publishes no port to the host" test -z "$published"
done
check "caddy publishes the HTTPS port" \
  bash -c "docker port \"\$(./compose.sh ps -q caddy)\" | grep -q 18443"

echo "== backup and restore"
./compose.sh exec -T postgres psql -U postgres -d golden_abode -c \
  "INSERT INTO users (id, name, email, role, is_active) VALUES (gen_random_uuid(), 'rehearsal marker', 'rehearsal@example.com', 'ADMIN', true)" >/dev/null
./compose.sh --profile backup run --rm backup | tail -1
./compose.sh --profile backup run --rm --entrypoint pg-restore.sh backup \
  --latest --target-db rehearsal_restore_check | tee restore.out
check "the restore reports the marker row" bash -c "grep -E '^users +1 ' restore.out"
check "restoring over the live database is refused" bash -c \
  "! ./compose.sh --profile backup run --rm --entrypoint pg-restore.sh backup --latest --target-db golden_abode"

echo "== second deploy (takes a pre-deploy backup first)"
./deploy.sh good-2
check "second deploy recorded its tag" test "$(cat .current-tag)" = good-2

echo "== a broken deploy must roll back"
if ./deploy.sh broken; then
  echo "FAIL  the broken deploy was reported as a success" >&2
  exit 1
fi
check "the previous tag is still current" test "$(cat .current-tag)" = good-2
check "the API is healthy again after the rollback" curl -fsS -k https://localhost:18443/health
check "the running image is the previous one" \
  bash -c "docker inspect -f '{{.Config.Image}}' \"\$(./compose.sh ps -q api)\" | grep -q good-2"

echo "== the sweep service, from the production image"
./compose.sh --profile sweep run --rm sweep | tee sweep.out
check "the sweep ran as a dry run" bash -c "grep -q '\"mode\": \"dry-run\"' sweep.out"

echo "== memory (limits are in docker-compose.prod.yml)"
for service in caddy api postgres redis meilisearch; do
  limit="$(docker inspect -f '{{.HostConfig.Memory}}' "$(./compose.sh ps -q "$service")")"
  check "$service has a memory limit applied" test "$limit" -gt 0
done
# Only this project's containers: a bare `docker stats` would also list anything
# else running on the machine, such as a development stack.
mapfile -t rehearsal_containers < <(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME")
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' "${rehearsal_containers[@]}"

echo
echo "REHEARSAL PASSED ($PASS checks)"
