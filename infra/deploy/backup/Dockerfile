# Same major version as the database server, so pg_dump never writes a format a
# newer server cannot restore, and pg_restore is never older than the dump.
FROM postgres:16-alpine

RUN apk add --no-cache aws-cli jq

COPY pg-backup.sh pg-restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/pg-backup.sh /usr/local/bin/pg-restore.sh

# Backs up by default. To restore:
#   docker compose --profile backup run --rm --entrypoint pg-restore.sh backup --latest --target-db NAME
ENTRYPOINT ["pg-backup.sh"]
