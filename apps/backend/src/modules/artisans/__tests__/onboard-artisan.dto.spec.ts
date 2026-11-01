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

  it('rejects a servicePincode that is not a 6-digit Indian PIN code', async () => {
    const dto = plainToInstance(OnboardArtisanDto, {
      tradeType: 'PLUMBER',
      servicePincode: 'Bangalore',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'servicePincode')).toBe(true);
  });

  it('rejects a servicePincode with the wrong digit count', async () => {
    const dto = plainToInstance(OnboardArtisanDto, {
      tradeType: 'PLUMBER',
      servicePincode: '12345',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'servicePincode')).toBe(true);
  });

  it('rejects a servicePincode starting with 0 (not a real Indian PIN code)', async () => {
    const dto = plainToInstance(OnboardArtisanDto, {
      tradeType: 'PLUMBER',
      servicePincode: '012345',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'servicePincode')).toBe(true);
  });
});
