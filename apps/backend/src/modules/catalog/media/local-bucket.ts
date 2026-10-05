import { CreateBucketCommand, PutBucketPolicyCommand, type S3Client } from '@aws-sdk/client-s3';

// Creates a bucket shaped like production: private by default, with only
// variants/* readable anonymously (what CloudFront's origin access exposes on
// AWS). Used by `pnpm storage:init-local` and by the integration tests. It is a
// dev/test helper, not part of the running app.
export async function ensureLocalBucket(client: S3Client, bucket: string): Promise<void> {
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
}
