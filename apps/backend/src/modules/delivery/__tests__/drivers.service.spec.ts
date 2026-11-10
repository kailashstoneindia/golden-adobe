import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getModelToken } from '@nestjs/sequelize';
import { Role } from '@golden-abode/types';
import { DriversService } from '../drivers.service';
import { VehiclesService } from '../vehicles.service';
import { CreateDriverDto } from '../dto/driver.dto';
import { User } from '../../users/models/user.model';
import { Driver } from '../models/driver.model';
import { createDeliveryTestModule } from './delivery-test-app';

let phoneSeq = Math.floor(Math.random() * 900000);
const nextPhone = () => `+9198${String(1000000 + phoneSeq++).padStart(8, '0')}`;
const tag = () => `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

describe('DriversService create and read (decision 0060)', () => {
  let drivers: DriversService;
  let vehicles: VehiclesService;
  let userModel: typeof User;
  let driverModel: typeof Driver;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const t = await createDeliveryTestModule([DriversService, VehiclesService]);
    drivers = t.moduleRef.get(DriversService);
    vehicles = t.moduleRef.get(VehiclesService);
    userModel = t.moduleRef.get(getModelToken(User));
    driverModel = t.moduleRef.get(getModelToken(Driver));
    cleanup = t.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  const input = (over: Record<string, unknown> = {}) => ({
    name: 'Test Driver One',
    phone: nextPhone(),
    licenceNumber: `TEST-${tag()}`,
    ...over,
  });

  it('creates an approved, active DRIVER user and the driver profile together', async () => {
    const dto = input({ helperName: 'Helper', helperPhone: '+919811111111' });
    const created = await drivers.create(dto as never);

    expect(created).toMatchObject({
      name: 'Test Driver One',
      phone: dto.phone,
      isActive: true,
      licenceNumber: dto.licenceNumber,
      helperName: 'Helper',
      helperPhone: '+919811111111',
      vehicle: null,
      licenceDocViewUrl: null,
      aadhaarDocViewUrl: null,
    });
    const user = await userModel.findByPk(created.userId);
    expect(user).toMatchObject({ role: Role.DRIVER, isApproved: true, isActive: true });
  });

  it('409s on a phone used by any user and creates nothing', async () => {
    const dto = input();
    await drivers.create(dto as never);
    const before = await driverModel.count();

    await expect(
      drivers.create({ ...dto, licenceNumber: `TEST-${tag()}` } as never),
    ).rejects.toThrow(ConflictException);
    expect(await driverModel.count()).toBe(before);
  });

  it('400s on an unknown or inactive vehicle', async () => {
    await expect(
      drivers.create(input({ vehicleId: '00000000-0000-4000-8000-000000000000' }) as never),
    ).rejects.toThrow(BadRequestException);

    const v = await vehicles.create({ registrationNumber: tag(), type: 'Tempo' });
    await vehicles.update(v.id, { isActive: false });
    await expect(drivers.create(input({ vehicleId: v.id }) as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('409s when the vehicle already belongs to another driver, and rolls the user back', async () => {
    const v = await vehicles.create({ registrationNumber: tag(), type: 'Tempo' });
    await drivers.create(input({ vehicleId: v.id }) as never);

    const second = input({ vehicleId: v.id });
    await expect(drivers.create(second as never)).rejects.toThrow(ConflictException);
    expect(await userModel.findOne({ where: { phone: second.phone } })).toBeNull();
  });

  it('get returns the driver with the vehicle expanded; unknown id 404s', async () => {
    const v = await vehicles.create({ registrationNumber: tag(), type: 'Truck' });
    const created = await drivers.create(input({ vehicleId: v.id }) as never);

    const got = await drivers.get(created.id);
    expect(got.vehicle).toEqual(v);
    await expect(drivers.get('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('list pages drivers and searches by name or phone', async () => {
    const dto = input({ name: 'Test Driver Searchable' });
    const created = await drivers.create(dto as never);

    const byPhone = await drivers.list({ search: dto.phone, page: 1, limit: 10 });
    expect(byPhone.items.map((d) => d.id)).toEqual([created.id]);
    expect(byPhone).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });

    const byName = await drivers.list({ search: 'Searchable', page: 1, limit: 10 });
    expect(byName.items.map((d) => d.id)).toContain(created.id);
  });
});

describe('CreateDriverDto validation (decision 0060)', () => {
  const errorsFor = async (over: Record<string, unknown>) =>
    validate(
      plainToInstance(CreateDriverDto, {
        name: 'Test Driver',
        phone: '+919876543210',
        licenceNumber: 'DL-1',
        ...over,
      }),
    );

  it('accepts a valid body', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each(['9876543210', '+915876543210', '+91987654321', '+9198765432101'])(
    'rejects phone %s',
    async (phone) => {
      const errors = await errorsFor({ phone });
      expect(errors.map((e) => e.property)).toContain('phone');
    },
  );
});
