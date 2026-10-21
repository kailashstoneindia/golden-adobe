# Deploying Golden Abode to AWS

The runbook for decisions [0032](../../docs/decisions/0032-aws-cost-minimized-single-box.md)
(one small EC2 box) and [0033](../../docs/decisions/0033-product-media-s3-presigned.md)
(product media on S3 + CloudFront). Build plan:
[aws-pre-deploy-implementation-plan.md](../../docs/aws-pre-deploy-implementation-plan.md).

## Read this first

**Verified locally, not yet run on AWS.** The stack, the deploy and rollback logic, the
backup and restore, and the upload-to-Lambda loop were all exercised on a laptop
(`rehearse.sh`, below). The AWS commands in this file were written from AWS's
documentation and have **not** been run against a real account. Run them one step at a
time, and read each "Check" line before moving on. If one fails, stop and fix it; do not
skip ahead.

## What runs where

```
 customers / admins
        |
  CloudFront (media)        CloudFront (admin)
   variants/* only           /*   -> S3 admin bucket
        |                    /api/* -> the box
   S3 media bucket                     |
   original/ (private)                 v
   variants/ (CDN)          EC2 t4g.small  (ap-south-1, one box)
        ^   |               +-- caddy        :80/:443, automatic TLS
        |   | upload event  +-- api          NestJS + search worker
   browser  v               +-- postgres     data volume on EBS
   (presigned POST)   Lambda +-- redis
   media variants     (arm64) +-- meilisearch  local disk, never network storage
        |                    nightly pg_dump -> S3 backup bucket
        +--- signed callback --> api
```

Only Caddy is reachable from the internet. Postgres, Redis and Meilisearch have no
published ports, and the instance has **no SSH port**: you reach it with SSM Session
Manager.

## Files

| File                                     | What it is                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `docker-compose.prod.yml`                | The stack. Memory-capped to fit 2 GB. Project name `golden-abode-prod`.          |
| `Caddyfile`                              | TLS and reverse proxy                                                            |
| `deploy.sh`                              | Deploys one image tag: backup, replace the api, health check, automatic rollback |
| `compose.sh`                             | `docker compose` with the right files and image; used by everything below        |
| `render-env.sh`                          | Writes `.env` from SSM Parameter Store                                           |
| `bootstrap-host.sh`                      | One-time instance setup (Docker, swap, timers, security updates)                 |
| `backup/`                                | Nightly `pg_dump` to S3, and the restore script                                  |
| `systemd/`                               | Timers for the nightly backup and the weekly media sweep                         |
| `docker-compose.maintenance.yml`         | Temporarily exposes Postgres on the box's loopback for an SSM port-forward       |
| `rehearse.sh`                            | Rehearses all of the above on a laptop                                           |
| `../aws/`                                | The IAM, S3 and CloudFront documents the steps below apply                       |
| `../../.github/workflows/deploy-aws.yml` | The deploy pipeline. Inert until `AWS_DEPLOY_ENABLED` is `true`                  |

## Rehearse it locally first

Needs Docker and the MinIO container (`docker compose up -d minio` at the repo root).

```bash
infra/deploy/rehearse.sh
```

It builds the backend image, then runs the real `deploy.sh` three times: a first deploy
(running every migration on an empty database), a second deploy, and a deliberately
broken one that must roll back. It also checks that nothing but Caddy is exposed, that a
backup restores with the right data, that restoring over the live database is refused,
and that the sweep runs from the production image. It uses its own compose project
(`golden-abode-rehearsal`) so it can never touch a development stack, and removes
everything it created.

## Cost, and the free credits

| Item                                     | About, per month |
| ---------------------------------------- | ---------------- |
| EC2 `t4g.small`, on demand               | $12–14           |
| EBS gp3, 30 GB                           | $3               |
| **Public IPv4 address (the Elastic IP)** | **$3.65**        |
| S3, CloudFront, Lambda, SSM, CloudWatch  | $2–8             |
| ECR storage (10 images)                  | under $1         |
| **Total**                                | **about $22–30** |

The public IPv4 charge ($0.005 per hour since February 2024) was missing from the earlier
estimate in 0032. A new account gets up to **$200 of credits for 6 months** on the Free
plan; at this rate that is the whole six months. **On the Free plan nothing can be billed
to a card**: when the credits or the six months run out, the account closes unless you
deliberately upgrade. Check, before you rely on it, that the Free plan allows every
service used here (EC2, ECR, S3, CloudFront, Lambda, SQS, SSM, CloudWatch, ACM): AWS says
so in the console if one is restricted. If one is, stop and decide deliberately.

## Provisioning, step by step

Every step is a command you run once. Set these variables first, in a shell that stays
open for the whole session. Bucket names are global across AWS, so they carry the
account id.

```bash
export AWS_REGION=ap-south-1
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

export GITHUB_ORG=<your GitHub organisation or user>
export GITHUB_REPO=<repository name>

export API_DOMAIN=api.example.com        # the box (Caddy gets its certificate here)
export ADMIN_DOMAIN=admin.example.com    # the admin app
export MEDIA_DOMAIN=media.example.com    # product images

export MEDIA_BUCKET=golden-abode-media-$ACCOUNT_ID
export ADMIN_BUCKET=golden-abode-admin-$ACCOUNT_ID
export BACKUP_BUCKET=golden-abode-backup-$ACCOUNT_ID
export ECR_REPOSITORY=golden-abode-backend
export LAMBDA_NAME=golden-abode-media-variants

# Renders a policy file from this repo by filling in the <PLACEHOLDERS>.
render() {
  sed -e "s/<ACCOUNT_ID>/$ACCOUNT_ID/g" -e "s/<REGION>/$AWS_REGION/g" \
      -e "s/<MEDIA_BUCKET>/$MEDIA_BUCKET/g" -e "s/<ADMIN_BUCKET>/$ADMIN_BUCKET/g" \
      -e "s/<BACKUP_BUCKET>/$BACKUP_BUCKET/g" -e "s/<ECR_REPOSITORY>/$ECR_REPOSITORY/g" \
      -e "s/<LAMBDA_FUNCTION_NAME>/$LAMBDA_NAME/g" -e "s/<ADMIN_DOMAIN>/$ADMIN_DOMAIN/g" \
      -e "s/<GITHUB_ORG>/$GITHUB_ORG/g" -e "s/<GITHUB_REPO>/$GITHUB_REPO/g" "$1"
}
```

### 1. Protect the account

1. Create the account and choose the **Free plan**.
2. Turn on MFA for the root user, then stop using root: create an administrator user (IAM
   Identity Center or an IAM user with MFA) and use that.
3. In **Billing > Budgets**, create a monthly cost budget with an email alert (this also
   earns $20 of credit).
4. Check the credits page shows the $100 starting credit.

Check: `aws sts get-caller-identity` shows your administrator, not root.

### 2. Buckets

Three private buckets. Public access stays blocked on all of them: the CDN reaches the
media bucket through an Origin Access Control, never by making it public.

```bash
for bucket in "$MEDIA_BUCKET" "$ADMIN_BUCKET" "$BACKUP_BUCKET"; do
  aws s3api create-bucket --bucket "$bucket" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION"
  aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
done

# Direct browser uploads to the media bucket, from the admin origin only.
render infra/aws/s3/media-cors.json > /tmp/media-cors.json
aws s3api put-bucket-cors --bucket "$MEDIA_BUCKET" --cors-configuration file:///tmp/media-cors.json
aws s3api put-bucket-lifecycle-configuration --bucket "$MEDIA_BUCKET" \
  --lifecycle-configuration file://infra/aws/s3/media-lifecycle.json

# Backups expire after 35 days; deploy bundles after 30. Versioning protects against
# an overwritten or deleted backup.
aws s3api put-bucket-versioning --bucket "$BACKUP_BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" \
  --lifecycle-configuration file://infra/aws/s3/backup-lifecycle.json
```

The media bucket **policy** is applied in step 9, once the CloudFront distribution exists.

Check: `aws s3api get-public-access-block --bucket "$MEDIA_BUCKET"` shows all four `true`.

### 3. Container registry

```bash
aws ecr create-repository --repository-name "$ECR_REPOSITORY" \
  --image-scanning-configuration scanOnPush=true
aws ecr put-lifecycle-policy --repository-name "$ECR_REPOSITORY" --lifecycle-policy-text '{
  "rules": [{"rulePriority": 1, "description": "keep the newest 10",
    "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
    "action": {"type": "expire"}}]}'
```

### 4. The instance's identity

The box gets credentials from an IAM role, so no AWS key exists anywhere.

```bash
cat > /tmp/ec2-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam create-role --role-name golden-abode-box --assume-role-policy-document file:///tmp/ec2-trust.json
aws iam attach-role-policy --role-name golden-abode-box \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
render infra/aws/iam/ec2-instance-policy.json > /tmp/ec2-policy.json
aws iam put-role-policy --role-name golden-abode-box --policy-name golden-abode-box \
  --policy-document file:///tmp/ec2-policy.json
aws iam create-instance-profile --instance-profile-name golden-abode-box
aws iam add-role-to-instance-profile --instance-profile-name golden-abode-box --role-name golden-abode-box
```

### 5. The instance

```bash
VPC_ID="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SG_ID="$(aws ec2 create-security-group --group-name golden-abode-box \
  --description 'Golden Abode box: web only, no SSH' --vpc-id "$VPC_ID" --query GroupId --output text)"
for port in 80 443; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port "$port" --cidr 0.0.0.0/0
done

AMI="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --query Parameter.Value --output text)"

# HttpPutResponseHopLimit=2 is essential: with the default of 1, the AWS SDK inside a
# Docker container cannot reach the instance role, and uploads, backups and the
# secrets lookup all fail with "no credentials".
INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small \
  --iam-instance-profile Name=golden-abode-box --security-group-ids "$SG_ID" \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=golden-abode},{Key=Role,Value=golden-abode-app}]' \
  --query 'Instances[0].InstanceId' --output text)"

ALLOC_ID="$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID"
aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" --query 'Addresses[0].PublicIp' --output text
```

Create a DNS `A` record for `API_DOMAIN` pointing at that address now: Caddy needs it to
get its certificate on the first deploy.

Check: after a minute, `aws ssm describe-instance-information` lists the instance
(Session Manager can reach it). The `Role=golden-abode-app` tag is how the deploy
pipeline finds the box.

### 6. Secrets

One parameter per value under `/golden-abode/prod/`. The box reads them with its role;
the secrets never touch git or CI. Generate them here, not by hand:

```bash
secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40; }
put() { aws ssm put-parameter --name "/golden-abode/prod/$1" --type "$2" --value "$3" --overwrite >/dev/null; }

put API_DOMAIN String "$API_DOMAIN"
put ACME_EMAIL String "ops@example.com"             # Let's Encrypt contact: use a real one
put AWS_REGION String "$AWS_REGION"
put S3_MEDIA_BUCKET String "$MEDIA_BUCKET"
put MEDIA_PUBLIC_BASE_URL String "https://$MEDIA_DOMAIN"
put BACKUP_BUCKET String "$BACKUP_BUCKET"
put BACKUP_METRIC_ENABLED String true
put DB_PASS SecureString "$(secret)"
put JWT_ACCESS_SECRET SecureString "$(secret)"
put JWT_ONBOARDING_SECRET SecureString "$(secret)"
put ADMIN_REGISTRATION_SECRET SecureString "$(secret)"
put MEILI_MASTER_KEY SecureString "$(secret)"
put MEDIA_CALLBACK_SECRET SecureString "$(secret)"
```

Add the MSG91 values (`USE_MSG91_SMS`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`) here when SMS
goes live. [.env.example](.env.example) lists every value.

Check: `aws ssm get-parameters-by-path --path /golden-abode/prod/ --query 'Parameters[].Name'`
lists them all.

### 7. The media Lambda

```bash
# A queue for events that failed every retry, so none vanishes silently.
DLQ_URL="$(aws sqs create-queue --queue-name golden-abode-media-dlq --query QueueUrl --output text)"
DLQ_ARN="$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn \
  --query Attributes.QueueArn --output text)"

aws iam create-role --role-name golden-abode-media-lambda \
  --assume-role-policy-document file://infra/aws/iam/lambda-trust.json
aws iam attach-role-policy --role-name golden-abode-media-lambda \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
render infra/aws/iam/lambda-policy.json | sed "s/<DLQ_NAME>/golden-abode-media-dlq/g" > /tmp/lambda-policy.json
aws iam put-role-policy --role-name golden-abode-media-lambda --policy-name golden-abode-media-lambda \
  --policy-document file:///tmp/lambda-policy.json

# Build the zip (sharp for linux/arm64, checked before zipping).
pnpm install --frozen-lockfile
pnpm --filter @golden-abode/media-lambda package

# The secret goes in through a file that is deleted straight away, not through the
# command line and shell history.
umask 077
SECRET="$(aws ssm get-parameter --name /golden-abode/prod/MEDIA_CALLBACK_SECRET \
  --with-decryption --query Parameter.Value --output text)"
printf '{"Variables":{"API_CALLBACK_BASE_URL":"https://%s","MEDIA_CALLBACK_SECRET":"%s"}}' \
  "$API_DOMAIN" "$SECRET" > /tmp/lambda-env.json
unset SECRET

sleep 10   # a new IAM role takes a few seconds to become usable
aws lambda create-function --function-name "$LAMBDA_NAME" --runtime nodejs22.x --architectures arm64 \
  --handler index.handler --memory-size 1024 --timeout 30 \
  --role "arn:aws:iam::$ACCOUNT_ID:role/golden-abode-media-lambda" \
  --zip-file fileb://apps/media-lambda/dist/function.zip \
  --environment file:///tmp/lambda-env.json
rm -f /tmp/lambda-env.json
aws lambda wait function-active --function-name "$LAMBDA_NAME"

# Failed invocations are retried twice by S3, then parked in the queue.
aws lambda put-function-event-invoke-config --function-name "$LAMBDA_NAME" \
  --maximum-retry-attempts 2 \
  --destination-config "{\"OnFailure\":{\"Destination\":\"$DLQ_ARN\"}}"

# Logs: create the group so retention can be set before the first run.
aws logs create-log-group --log-group-name "/aws/lambda/$LAMBDA_NAME"
aws logs put-retention-policy --log-group-name "/aws/lambda/$LAMBDA_NAME" --retention-in-days 14

# The "live" alias is what S3 triggers. A deploy publishes a version and moves the
# alias; a rollback moves it back.
VERSION="$(aws lambda publish-version --function-name "$LAMBDA_NAME" --query Version --output text)"
aws lambda create-alias --function-name "$LAMBDA_NAME" --name live --function-version "$VERSION"
aws lambda add-permission --function-name "$LAMBDA_NAME:live" --statement-id s3-invoke \
  --action lambda:InvokeFunction --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::$MEDIA_BUCKET" --source-account "$ACCOUNT_ID"

# Only uploads under original/ trigger it, which is also what stops it re-triggering
# on its own variants.
cat > /tmp/s3-notify.json <<JSON
{"LambdaFunctionConfigurations":[{
  "LambdaFunctionArn":"arn:aws:lambda:$AWS_REGION:$ACCOUNT_ID:function:$LAMBDA_NAME:live",
  "Events":["s3:ObjectCreated:*"],
  "Filter":{"Key":{"FilterRules":[{"Name":"prefix","Value":"original/"}]}}}]}
JSON
aws s3api put-bucket-notification-configuration --bucket "$MEDIA_BUCKET" \
  --notification-configuration file:///tmp/s3-notify.json
```

**Reserved concurrency.** The plan caps the function at 5 concurrent runs. A new account's
Lambda quota is often only 10 in total, and AWS refuses to reserve capacity below its
floor, so `aws lambda put-function-concurrency --function-name "$LAMBDA_NAME"
--reserved-concurrent-executions 5` may be rejected. If it is, skip it: the account quota
already caps the function. Ask for a quota increase later if you need one.

Check: `aws lambda get-function --function-name "$LAMBDA_NAME:live"` succeeds.

### 8. Certificates

CloudFront only accepts certificates from **us-east-1**:

```bash
for domain in "$MEDIA_DOMAIN" "$ADMIN_DOMAIN"; do
  aws acm request-certificate --region us-east-1 --domain-name "$domain" --validation-method DNS \
    --query CertificateArn --output text
done
aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Create the CNAME each certificate asks for at your DNS provider, and wait until
`aws acm describe-certificate ... --query Certificate.Status` is `ISSUED`.

### 9. CloudFront

Two distributions. The console is the least error-prone way to create them; the settings
that matter are in [../aws/cloudfront/README.md](../aws/cloudfront/README.md). In short:

- **Media**: origin = the media bucket with a new Origin Access Control; one default
  behaviour with the `CachingOptimized` policy; alternate domain = `MEDIA_DOMAIN`.
- **Admin**: default behaviour to the admin bucket (OAC); a second behaviour `/api/*` to
  `API_DOMAIN` over HTTPS only with `CachingDisabled`, `AllViewerExceptHostHeader` and all
  methods; custom error responses turning 403 and 404 into `/index.html` with status 200.

Then allow the media distribution to read **variants only**, and give the admin
distribution's id to the pipeline:

```bash
MEDIA_DIST_ID=<the media distribution id>
render infra/aws/s3/media-bucket-policy.json | sed "s/<MEDIA_DISTRIBUTION_ID>/$MEDIA_DIST_ID/g" > /tmp/media-policy.json
aws s3api put-bucket-policy --bucket "$MEDIA_BUCKET" --policy file:///tmp/media-policy.json
# The admin bucket needs the equivalent policy for the admin distribution, reading everything:
#   Principal cloudfront.amazonaws.com, Action s3:GetObject, Resource arn:aws:s3:::$ADMIN_BUCKET/*,
#   Condition AWS:SourceArn = the admin distribution's ARN.
```

Point `MEDIA_DOMAIN` and `ADMIN_DOMAIN` at their distributions with `CNAME` records.

Check, once an image exists: its `variants/` URL answers 200 through `MEDIA_DOMAIN`, and
the same path under `original/` answers **403**.

### 10. GitHub access, with no stored keys

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
render infra/aws/iam/github-deploy-trust.json > /tmp/gh-trust.json
aws iam create-role --role-name golden-abode-deploy --assume-role-policy-document file:///tmp/gh-trust.json
render infra/aws/iam/github-deploy-policy.json \
  | sed -e "s/<ADMIN_DISTRIBUTION_ID>/<the admin distribution id>/g" > /tmp/gh-policy.json
aws iam put-role-policy --role-name golden-abode-deploy --policy-name golden-abode-deploy \
  --policy-document file:///tmp/gh-policy.json
```

In GitHub, **Settings > Environments**, create `production` (add yourself as a required
reviewer if you want to approve each deploy). Then **Settings > Secrets and variables >
Actions > Variables**:

| Variable                                       | Value                                                |
| ---------------------------------------------- | ---------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN`                          | `arn:aws:iam::<ACCOUNT_ID>:role/golden-abode-deploy` |
| `ECR_REPOSITORY`                               | `golden-abode-backend`                               |
| `BACKUP_BUCKET`                                | the backup bucket name                               |
| `ADMIN_BUCKET`                                 | the admin bucket name                                |
| `ADMIN_DISTRIBUTION_ID`                        | the admin distribution id                            |
| `LAMBDA_FUNCTION_NAME`                         | `golden-abode-media-variants`                        |
| `API_DOMAIN` / `ADMIN_DOMAIN` / `MEDIA_DOMAIN` | the three domains                                    |
| `ARM_RUNNER` (optional)                        | a native arm64 runner label, if your plan has one    |
| `AWS_DEPLOY_ENABLED`                           | `true` — **set this last**                           |

### 11. Prepare the box

From your machine, upload the first bundle (CI does this on every later deploy):

```bash
tar czf /tmp/deploy-bundle.tgz --exclude=.rehearsal --exclude=rehearse.sh -C infra deploy
aws s3 cp /tmp/deploy-bundle.tgz "s3://$BACKUP_BUCKET/deploy-bundles/first.tgz"
aws ssm start-session --target "$INSTANCE_ID"     # needs the Session Manager plugin
```

On the instance:

```bash
sudo -i
mkdir -p /opt/golden-abode && cd /opt/golden-abode
aws s3 cp s3://<BACKUP_BUCKET>/deploy-bundles/first.tgz /tmp/b.tgz --region ap-south-1
tar -xzf /tmp/b.tgz -C /opt/golden-abode --strip-components=1
./bootstrap-host.sh
cp deploy.conf.example deploy.conf && vi deploy.conf   # your account id and region
```

`bootstrap-host.sh` ends by checking that a container can reach the instance role. If it
warns, the metadata hop limit is wrong: apply the fix it prints.

### 12. First deploy

In GitHub, **Actions > Deploy to AWS > Run workflow**. It builds the image, runs the
migrations, and checks the API through Caddy over HTTPS. Watch the SSM output in the job
log; `deploy.sh` prints each step.

Check: `curl https://$API_DOMAIN/health` answers, and `https://$ADMIN_DOMAIN` loads the
admin app.

## After the first deploy

### Create the first admin

Use the existing `/api/auth/admin/register` flow with the `ADMIN_REGISTRATION_SECRET` you
stored in step 6.

### Load the demo images

The loader needs the database, so open a temporary, loopback-only door to it through SSM
rather than exposing Postgres. On the instance:

```bash
cd /opt/golden-abode
COMPOSE_FILES="docker-compose.prod.yml docker-compose.maintenance.yml" ./compose.sh up -d postgres
```

On your machine, in one terminal:

```bash
aws ssm start-session --target "$INSTANCE_ID" --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["127.0.0.1"],"portNumber":["5432"],"localPortNumber":["15432"]}'
```

In another, run the loader (a dry run first, then `--apply`):

```bash
export DB_HOST=127.0.0.1 DB_PORT=15432 DB_NAME=golden_abode DB_USER=postgres
export DB_PASS="$(aws ssm get-parameter --name /golden-abode/prod/DB_PASS --with-decryption --query Parameter.Value --output text)"
export S3_MEDIA_BUCKET="$MEDIA_BUCKET" MEDIA_PUBLIC_BASE_URL="https://$MEDIA_DOMAIN"
export MEDIA_CALLBACK_SECRET="$(aws ssm get-parameter --name /golden-abode/prod/MEDIA_CALLBACK_SECRET --with-decryption --query Parameter.Value --output text)"
pnpm --filter @golden-abode/backend media:load-demo
pnpm --filter @golden-abode/backend media:load-demo -- --apply
```

Expect 258 images attached (122 Lavish, 136 Pearl) and 227 products left without a photo
because none exists (70 Lavish, 157 Pearl). The Lambda makes the variants and the API marks
each one ready; the loader waits and reports. Then close the door again:

```bash
cd /opt/golden-abode && ./compose.sh up -d postgres
```

### Rebuild search once

Existing search documents have no image yet. Queue one full rebuild:

```bash
cd /opt/golden-abode
./compose.sh exec -T postgres psql -U postgres -d golden_abode \
  -c "INSERT INTO search_outbox (entity_type, reason) VALUES ('all', 'primary image field')"
```

The worker picks it up within seconds and swaps the index in without downtime.

### Alarms

```bash
TOPIC_ARN="$(aws sns create-topic --name golden-abode-alerts --query TopicArn --output text)"
aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol email --notification-endpoint ops@example.com
# Confirm the subscription from the email AWS sends.

# No successful backup for 26 hours. Missing data counts as breaching: a backup that
# stops running publishes nothing, and silence is exactly what must raise the alarm.
aws cloudwatch put-metric-alarm --alarm-name golden-abode-backup-missing \
  --namespace GoldenAbode/Backup --metric-name Success --statistic Sum \
  --period 3600 --evaluation-periods 26 --datapoints-to-alarm 26 \
  --threshold 1 --comparison-operator LessThanThreshold --treat-missing-data breaching \
  --alarm-actions "$TOPIC_ARN"

# Any event that failed every retry of the media Lambda.
aws cloudwatch put-metric-alarm --alarm-name golden-abode-media-dlq-not-empty \
  --namespace AWS/SQS --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=golden-abode-media-dlq --statistic Maximum \
  --period 300 --evaluation-periods 1 --threshold 0 --comparison-operator GreaterThanThreshold \
  --alarm-actions "$TOPIC_ARN"
```

### Prove the backup restores

Do this once now, then monthly, so the first restore is never during an outage:

```bash
cd /opt/golden-abode
./compose.sh --profile backup run --rm backup
./compose.sh --profile backup run --rm --entrypoint pg-restore.sh backup \
  --latest --target-db restore_check
./compose.sh exec -T postgres dropdb -U postgres restore_check
```

The restore prints row counts next to the live ones. It refuses to touch the live
database unless you pass `--force`.

## Day-to-day

| Task                      | How                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy                    | Merge to `main`. CI runs, then **Deploy to AWS** ships the same commit.                                                                                                                  |
| Roll back                 | On the box: `/opt/golden-abode/deploy.sh <older-git-sha>`. The last 3 images stay on disk, ECR keeps 10.                                                                                 |
| See what is running       | `cd /opt/golden-abode && ./compose.sh ps`                                                                                                                                                |
| Read logs                 | `./compose.sh logs --tail 200 api` (also `caddy`, `postgres`, `meilisearch`)                                                                                                             |
| Backup now                | `./compose.sh --profile backup run --rm backup`                                                                                                                                          |
| Check the timers          | `systemctl list-timers 'golden-abode-*'`; `journalctl -u golden-abode-backup.service`                                                                                                    |
| Turn the media sweep live | Review a few weeks of its dry-run output (`journalctl -u golden-abode-media-sweep.service`), then add `MEDIA_SWEEP_ARGS=--apply` to the `MEDIA_SWEEP_ARGS` parameter in SSM and redeploy |
| Retry a stuck image       | In the admin product screen, **Retry** on the tile                                                                                                                                       |
| Bigger box                | Stop the instance, change the type to `t4g.medium`, start it. Do this if the box swaps regularly (`free -m`).                                                                            |
| Rebuild search            | The `INSERT INTO search_outbox ... 'all'` above. Meilisearch holds nothing Postgres cannot recreate.                                                                                     |
| Lose the box              | Launch a new one (steps 5 and 11), `deploy.sh`, then `pg-restore.sh --latest --force --target-db golden_abode` and rebuild search. Media is on S3 and unaffected.                        |

## Things that will bite

- **Deploys cause 10–20 seconds of downtime.** One API container is replaced. Zero-downtime
  deploys are out of scope for one small box.
- **Migrations cannot be rolled back.** A rollback puts the old code back against the
  already-migrated database, so migrations must be backward-compatible: add a column in one
  release, remove the old one in a later one. `deploy.sh` backs up before every deploy as the
  escape hatch.
- **One box is one point of failure.** No automatic failover. Recovery is the "Lose the box"
  row above, bounded by the nightly backup (at most about a day of data) and the pre-deploy
  backups.
- **Meilisearch must stay on local disk.** Never move its volume to network storage such as
  EFS ([0021](../../docs/decisions/0021-search-runtime-build-plan.md)).
- **The metadata hop limit must be 2** (step 5), or containers cannot use the instance role.
- **Let's Encrypt rate limits.** The `caddy_data` volume holds the certificates. Do not
  delete it casually.
