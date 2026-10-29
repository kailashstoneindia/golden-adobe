import { ObjectHead } from '../../catalog/media/object-storage';

// Stands in for the real S3 adapter in artisan-module specs that test the
// service/controller's own logic (key-prefix ownership, documentUrl
// persistence), not S3 itself — that coverage belongs to
// catalog/media/__tests__, which runs its specs against a real MinIO
// container.
export class FakeObjectStorage {
  private readonly existingKeys = new Set<string>();

  seed(key: string): void {
    this.existingKeys.add(key);
  }

  async presignPost() {
    return { url: 'https://example.test/upload', fields: {} };
  }

  async head(key: string): Promise<ObjectHead | null> {
    return this.existingKeys.has(key) ? { contentLength: 1024 } : null;
  }
}
