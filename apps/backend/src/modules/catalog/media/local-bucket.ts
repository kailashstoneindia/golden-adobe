import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutBucketPolicyCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

// The ARN MinIO gives the webhook target configured in docker-compose.yml.
export const LOCAL_LAMBDA_WEBHOOK_ARN = 'arn:minio:sqs::LAMBDA:webhook';

// Creates a bucket shaped like production: private by default, with only
// variants/* readable anonymously (what CloudFront's origin access exposes on
// AWS). Used by `pnpm storage:init-local` and by the integration tests. It is a
// dev/test helper, not part of the running app.
//
// notifyWebhookArn is opt-in: it makes uploads under original/ POST an event to
// the local Lambda server, like the S3 trigger does on AWS. Only the dev bucket
// wants that; test buckets must not, or every test upload would invoke it.
export async function ensureLocalBucket(
  client: S3Client,
  bucket: string,
  options: { notifyWebhookArn?: string } = {},
): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
  }

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadVariantsOnly',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/variants/*`],
          },
        ],
      }),
    }),
  );

  if (options.notifyWebhookArn) {
    await client.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucket,
        NotificationConfiguration: {
          QueueConfigurations: [
            {
              QueueArn: options.notifyWebhookArn,
              Events: ['s3:ObjectCreated:*'],
              // Only originals trigger it, exactly like the AWS trigger. This
              // is also what stops the Lambda re-triggering on its own variants.
              Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'original/' }] } },
            },
          ],
        },
      }),
    );
  }
}
