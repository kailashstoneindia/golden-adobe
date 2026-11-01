import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OnboardArtisanDto } from '../dto/onboard-artisan.dto';

describe('OnboardArtisanDto', () => {
  it('rejects a missing servicePincode', async () => {
    const dto = plainToInstance(OnboardArtisanDto, { tradeType: 'PLUMBER' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'servicePincode')).toBe(true);
  });

  it('rejects an empty-string servicePincode', async () => {
    const dto = plainToInstance(OnboardArtisanDto, {
      tradeType: 'PLUMBER',
      servicePincode: '   ',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'servicePincode')).toBe(true);
  });

  it('allows a valid servicePincode', async () => {
    const dto = plainToInstance(OnboardArtisanDto, {
      tradeType: 'PLUMBER',
      servicePincode: '560001',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
