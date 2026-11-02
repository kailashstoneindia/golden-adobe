import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentUploadUrlDto } from '../dto/create-document-upload-url.dto';

describe('CreateDocumentUploadUrlDto', () => {
  it('allows omitting purpose (defaults to the lead artisan own KYC document)', async () => {
    const dto = plainToInstance(CreateDocumentUploadUrlDto, { contentType: 'application/pdf' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('allows purpose: team_member', async () => {
    const dto = plainToInstance(CreateDocumentUploadUrlDto, {
      contentType: 'application/pdf',
      purpose: 'team_member',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unrecognized purpose', async () => {
    const dto = plainToInstance(CreateDocumentUploadUrlDto, {
      contentType: 'application/pdf',
      purpose: 'something_else',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'purpose')).toBe(true);
  });
});
