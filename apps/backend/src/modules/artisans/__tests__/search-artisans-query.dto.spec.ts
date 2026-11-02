import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchArtisansQueryDto } from '../dto/search-artisans-query.dto';

describe('SearchArtisansQueryDto', () => {
  it('allows an empty query (page/limit default, tradeType/pincode omitted)', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('allows a valid tradeType and pincode together', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, {
      tradeType: 'PLUMBER',
      pincode: '560001',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an unrecognized tradeType', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { tradeType: 'ASTRONAUT' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tradeType')).toBe(true);
  });

  it('rejects a pincode that is not a 6-digit Indian PIN code', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { pincode: 'Bangalore' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pincode')).toBe(true);
  });

  it('rejects a pincode with the wrong digit count', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { pincode: '12345' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pincode')).toBe(true);
  });

  it('rejects page below 1', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects limit above 100', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('allows limit at exactly the 100 boundary', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { limit: 100 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-integer page', async () => {
    const dto = plainToInstance(SearchArtisansQueryDto, { page: 1.5 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });
});
