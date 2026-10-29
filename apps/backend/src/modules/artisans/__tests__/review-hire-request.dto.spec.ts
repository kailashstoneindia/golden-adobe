import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewHireRequestDto } from '../dto/review-hire-request.dto';

describe('ReviewHireRequestDto', () => {
  it('rejects approve:false with no rejectReason', async () => {
    const dto = plainToInstance(ReviewHireRequestDto, { approve: false });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'rejectReason')).toBe(true);
  });

  it('allows approve:true with no rejectReason', async () => {
    const dto = plainToInstance(ReviewHireRequestDto, { approve: true });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('allows approve:false with a rejectReason', async () => {
    const dto = plainToInstance(ReviewHireRequestDto, {
      approve: false,
      rejectReason: 'Artisan fully booked this month',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
