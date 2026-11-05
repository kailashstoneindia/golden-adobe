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

  // Set by a test to act like an environment with no bucket configured.
  failSigning = false;
  presignGetCalls = 0;

  // Deterministic, so tests can assert which key a link was signed for.
  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    this.presignGetCalls += 1;
    if (this.failSigning) throw new Error('No value provided for input HTTP label: Bucket.');
    return `https://signed.example.test/${key}?expires=${expiresInSeconds}`;
  }

  async head(key: string): Promise<ObjectHead | null> {
    return this.existingKeys.has(key) ? { contentLength: 1024 } : null;
  }
}
