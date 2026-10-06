#!/bin/bash
# One-time setup of the EC2 instance (decision 0032). Amazon Linux 2023, as root:
#
#   sudo ./bootstrap-host.sh
#
# Run it from /opt/golden-abode once the deploy bundle has been unpacked there
# (see README.md). Safe to run again: every step checks before it changes.
#
# What it does: installs Docker and the Compose plugin, adds a 2 GB swap file as
# a safety net for a small box, installs the nightly backup and weekly media-sweep
# timers, turns on automatic security updates, and finally checks that containers
# can reach the instance role (the one thing that fails quietly if the instance
# was launched with the wrong metadata settings).
set -euo pipefail

[ "$(id -u)" -eq 0 ] || {
  echo "run as root: sudo ./bootstrap-host.sh" >&2
  exit 1
}

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
# Pinned and checksummed. Bump deliberately: the compose file uses features that
# need at least v2.24.
COMPOSE_VERSION="v2.29.7"

log() { echo "==> $*"; }

log "installing Docker and tools"
dnf install -y docker jq
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  log "installing the Docker Compose plugin $COMPOSE_VERSION"
  case "$(uname -m)" in
    aarch64) arch=aarch64 ;;
    x86_64) arch=x86_64 ;;
    *)
      echo "unsupported architecture $(uname -m)" >&2
      exit 1
      ;;
  esac
  base="https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-$arch"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/docker-compose" "$base"
  curl -fsSL -o "$tmp/docker-compose.sha256" "$base.sha256"
  (cd "$tmp" && echo "$(cut -d' ' -f1 docker-compose.sha256)  docker-compose" | sha256sum -c -)
  install -D -m 0755 "$tmp/docker-compose" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -rf "$tmp"
fi

if ! swapon --show | grep -q '/swapfile'; then
  log "adding a 2 GB swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
# Use swap only under real pressure: it is a net, not extra memory.
echo 'vm.swappiness=10' >/etc/sysctl.d/99-golden-abode.conf
sysctl -p /etc/sysctl.d/99-golden-abode.conf >/dev/null

log "installing the systemd timers (nightly backup, weekly media sweep)"
cp "$APP_DIR"/systemd/*.service "$APP_DIR"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now golden-abode-backup.timer golden-abode-media-sweep.timer

log "enabling automatic security updates"
dnf install -y dnf-automatic
sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' \
  /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer

chmod +x "$APP_DIR"/*.sh "$APP_DIR"/backup/*.sh

log "checking that containers can reach the instance role"
# IMDSv2 answers only one network hop by default, and a container is a second hop,
# so the AWS SDK inside the api container gets no credentials. The instance must
# be launched with --metadata-options HttpPutResponseHopLimit=2.
if docker run --rm public.ecr.aws/aws-cli/aws-cli sts get-caller-identity >/dev/null 2>&1; then
  echo "ok: containers can use the instance role"
else
  cat >&2 <<'EOF'
WARNING: a container could not get credentials from the instance role.
If the instance has a role attached, its metadata hop limit is probably 1. Fix:
  aws ec2 modify-instance-metadata-options --instance-id <id> \
    --http-tokens required --http-put-response-hop-limit 2
EOF
  exit 1
fi

log "host is ready. Next: create deploy.conf from deploy.conf.example, then deploy."
