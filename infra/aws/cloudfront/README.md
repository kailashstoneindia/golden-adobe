# CloudFront distributions

Two distributions, both with an Origin Access Control (OAC) for their S3 origin, so
the buckets stay fully private (Block Public Access on). The exact CLI steps are in
[../../deploy/README.md](../../deploy/README.md); this file is the reference for what
each distribution must look like.

## Media (`MEDIA_DOMAIN`, for example `media.example.com`)

Serves product image variants to customers.

| Setting       | Value                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin        | The media S3 bucket, through an OAC                                                                                                                        |
| Behaviour     | Default (`*`) only                                                                                                                                         |
| Viewer        | Redirect HTTP to HTTPS; GET and HEAD                                                                                                                       |
| Cache policy  | `CachingOptimized` (`658327ea-f89d-4fab-a63d-7e88639e58f6`). Safe to cache for a year: variant keys never change, because a new upload gets a new media id |
| Compression   | On                                                                                                                                                         |
| Price class   | `PriceClass_200` covers India and keeps the cost down                                                                                                      |
| Certificate   | ACM certificate for `MEDIA_DOMAIN`, requested in **us-east-1** (CloudFront only accepts that region)                                                       |
| Bucket policy | [../s3/media-bucket-policy.json](../s3/media-bucket-policy.json): the OAC may read **`variants/*` only**                                                   |

There is deliberately no rule that hides `original/*`: the bucket policy does it. A
request for an original reaches S3 with no permission to read it and gets **403**,
which the smoke job in `deploy-aws.yml` checks on every deploy.

## Admin (`ADMIN_DOMAIN`, for example `admin.example.com`)

Serves the admin single-page app and forwards its API calls to the box, so the
browser sees one origin and no CORS configuration is needed for `/api`.

| Behaviour     | Origin                                  | Cache policy                                               | Origin request policy                                                | Methods  |
| ------------- | --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| `/api/*`      | `API_DOMAIN` (the box, over HTTPS only) | `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`) | `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`) | All      |
| Default (`*`) | The admin S3 bucket, through an OAC     | `CachingOptimized`                                         | none                                                                 | GET/HEAD |

- Origin protocol for the box: **HTTPS only**, so the Caddy certificate is validated.
- **Custom error responses** on the S3 origin: 403 and 404 return `/index.html` with
  status 200, which is what makes client-side routes (`/catalog/products`) work on a
  refresh.
- Default root object: `index.html`.
- `index.html` is uploaded with `Cache-Control: no-cache` and everything else with a
  year-long `immutable`, by the deploy workflow.
- Certificate: ACM in **us-east-1**.

## DNS

| Name           | Record                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| `API_DOMAIN`   | `A` record to the instance's Elastic IP (Caddy gets its certificate here) |
| `MEDIA_DOMAIN` | `CNAME` / alias to the media distribution                                 |
| `ADMIN_DOMAIN` | `CNAME` / alias to the admin distribution                                 |

Any DNS provider works; Route 53 is optional.
