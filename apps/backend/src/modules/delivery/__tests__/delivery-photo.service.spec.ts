import { BadRequestException } from '@nestjs/common';
import { DeliveryPhotoService } from '../delivery-photo.service';

const GROUP = '11111111-1111-4111-8111-111111111111';
const OTHER_GROUP = '22222222-2222-4222-8222-222222222222';

function setup(existing: string[] = []) {
  const presignPost = jest.fn(async (input: { key: string }) => ({
    url: 'https://example.test/upload',
    fields: { key: input.key },
  }));
  const head = jest.fn(async (key: string) =>
    existing.includes(key) ? { contentLength: 10 } : null,
  );
  const service = new DeliveryPhotoService({ presignPost, head } as never);
  return { service, presignPost, head };
}

describe('DeliveryPhotoService (decision 0060)', () => {
  it('mints a key under delivery/<group>/<kind>- ending .jpg for image/jpeg', async () => {
    const { service, presignPost } = setup();
    const post = await service.createUploadUrl(GROUP, 'delivered', 'image/jpeg');
    const { key, contentType, maxBytes } = presignPost.mock.calls[0][0] as never;
    expect(key).toMatch(new RegExp(`^delivery/${GROUP}/delivered-[0-9a-f-]{36}\\.jpg$`));
    expect(contentType).toBe('image/jpeg');
    expect(maxBytes).toBeGreaterThan(0);
    expect(post.fields.key).toBe(key);
  });

  it('uses .png for image/png', async () => {
    const { service, presignPost } = setup();
    await service.createUploadUrl(GROUP, 'failed', 'image/png');
    expect((presignPost.mock.calls[0][0] as { key: string }).key).toMatch(/failed-.*\.png$/);
  });

  it('refuses anything but jpeg or png', async () => {
    const { service, presignPost } = setup();
    await expect(service.createUploadUrl(GROUP, 'delivered', 'application/pdf')).rejects.toThrow(
      BadRequestException,
    );
    expect(presignPost).not.toHaveBeenCalled();
  });

  it('accepts a key that was minted for this group and kind and exists', async () => {
    const key = `delivery/${GROUP}/delivered-abc.jpg`;
    const { service } = setup([key]);
    await expect(service.assertUploadedKey(GROUP, 'delivered', key)).resolves.toBeUndefined();
  });

  it('rejects a key for another group, another kind, or a missing object', async () => {
    const mine = `delivery/${GROUP}/delivered-abc.jpg`;
    const foreign = `delivery/${OTHER_GROUP}/delivered-abc.jpg`;
    const wrongKind = `delivery/${GROUP}/failed-abc.jpg`;
    const { service } = setup([mine, foreign, wrongKind]);
    await expect(service.assertUploadedKey(GROUP, 'delivered', foreign)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.assertUploadedKey(GROUP, 'delivered', wrongKind)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.assertUploadedKey(GROUP, 'delivered', `delivery/${GROUP}/delivered-gone.jpg`),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a key that is not a jpeg or png object', async () => {
    const key = `delivery/${GROUP}/delivered-abc.pdf`;
    const { service } = setup([key]);
    await expect(service.assertUploadedKey(GROUP, 'delivered', key)).rejects.toThrow(
      BadRequestException,
    );
  });
});
