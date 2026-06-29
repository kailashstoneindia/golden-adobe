#!/bin/sh
set -e

run_migrations() {
  npx sequelize-cli db:migrate --env production
}

if [ -n "$DATABASE_URL" ] || [ -n "$DB_HOST" ]; then
  echo "==> Running database migrations..."
  attempt=1
  max_attempts=10

  until run_migrations; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "==> Migration failed after ${max_attempts} attempts"
      exit 1
    fi

    echo "==> Migration attempt ${attempt} failed, retrying in 5s..."
    attempt=$((attempt + 1))
    sleep 5
  done

  echo "==> Migrations complete"
else
  echo "==> WARN: No database config found, skipping migrations"
fi

echo "==> Starting NestJS application..."
exec node dist/main.js
