import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from '../vehicles.service';
import { createDeliveryTestModule } from './delivery-test-app';

describe('VehiclesService (decision 0060)', () => {
  let service: VehiclesService;
  let cleanup: () => Promise<void>;
  const tag = () => `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  beforeAll(async () => {
    const t = await createDeliveryTestModule([VehiclesService]);
    service = t.moduleRef.get(VehiclesService);
    cleanup = t.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it('creates a vehicle and returns its dto, registration uppercased', async () => {
    const reg = tag();
    const dto = await service.create({
      registrationNumber: ` ${reg.toLowerCase()} `,
      type: 'Tempo',
      notes: 'Open body',
    });
    expect(dto).toEqual({
      id: expect.any(String),
      registrationNumber: reg,
      type: 'Tempo',
      notes: 'Open body',
      isActive: true,
    });
  });

  it('rejects a duplicate registration number regardless of case', async () => {
    const reg = tag();
    await service.create({ registrationNumber: reg, type: 'Tempo' });
    await expect(
      service.create({ registrationNumber: reg.toLowerCase(), type: 'Truck' }),
    ).rejects.toThrow(ConflictException);
  });

  it('updates type and active flag', async () => {
    const created = await service.create({ registrationNumber: tag(), type: 'Tempo' });
    const updated = await service.update(created.id, { type: 'Truck', isActive: false });
    expect(updated).toMatchObject({ id: created.id, type: 'Truck', isActive: false });
  });

  it('404s when updating an unknown vehicle', async () => {
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { type: 'Truck' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists every vehicle, including inactive ones', async () => {
    const a = await service.create({ registrationNumber: tag(), type: 'Tempo' });
    const b = await service.create({ registrationNumber: tag(), type: 'Tempo' });
    await service.update(b.id, { isActive: false });
    const ids = (await service.list()).map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
  });
});
