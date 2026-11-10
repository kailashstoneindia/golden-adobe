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
import { FakeObjectStorage } from '../../artisans/__tests__/fake-object-storage';

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

describe('DriversService update (decision 0060)', () => {
  let drivers: DriversService;
  let vehicles: VehiclesService;
  let userModel: typeof User;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const t = await createDeliveryTestModule([DriversService, VehiclesService]);
    drivers = t.moduleRef.get(DriversService);
    vehicles = t.moduleRef.get(VehiclesService);
    userModel = t.moduleRef.get(getModelToken(User));
    cleanup = t.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  const make = (over: Record<string, unknown> = {}) =>
    drivers.create({
      name: 'Test Driver Update',
      phone: nextPhone(),
      licenceNumber: `TEST-${tag()}`,
      ...over,
    } as never);

  it('persists helper name and phone', async () => {
    const d = await make();
    const updated = await drivers.update(d.id, {
      helperName: 'New Helper',
      helperPhone: '+919822222222',
    });
    expect(updated).toMatchObject({ helperName: 'New Helper', helperPhone: '+919822222222' });
  });

  it('400s when only one of helperName and helperPhone ends up set', async () => {
    const d = await make();
    await expect(drivers.update(d.id, { helperName: 'Alone' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(drivers.update(d.id, { helperPhone: '+919822222222' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('clears the helper when both are null', async () => {
    const d = await make({ helperName: 'H', helperPhone: '+919833333333' });
    const updated = await drivers.update(d.id, { helperName: null, helperPhone: null });
    expect(updated).toMatchObject({ helperName: null, helperPhone: null });
  });

  it('assigns, then unassigns a vehicle with null', async () => {
    const v = await vehicles.create({ registrationNumber: tag(), type: 'Tempo' });
    const d = await make();
    expect((await drivers.update(d.id, { vehicleId: v.id })).vehicle?.id).toBe(v.id);
    expect((await drivers.update(d.id, { vehicleId: null })).vehicle).toBeNull();
  });

  it('409s assigning a vehicle another driver holds; keeping your own is fine', async () => {
    const v = await vehicles.create({ registrationNumber: tag(), type: 'Tempo' });
    const holder = await make({ vehicleId: v.id });
    const other = await make();
    await expect(drivers.update(other.id, { vehicleId: v.id })).rejects.toThrow(ConflictException);
    await expect(drivers.update(holder.id, { vehicleId: v.id })).resolves.toBeDefined();
  });

  it('updates the linked user name and phone, and 409s on a taken phone', async () => {
    const d = await make();
    const taken = await make();
    const newPhone = nextPhone();

    const updated = await drivers.update(d.id, { name: 'Test Driver Renamed', phone: newPhone });
    expect(updated).toMatchObject({ name: 'Test Driver Renamed', phone: newPhone });
    expect((await userModel.findByPk(d.userId))?.phone).toBe(newPhone);

    await expect(drivers.update(d.id, { phone: taken.phone })).rejects.toThrow(ConflictException);
  });

  it('updates the licence number; unknown driver 404s', async () => {
    const d = await make();
    expect((await drivers.update(d.id, { licenceNumber: 'TEST-NEW' })).licenceNumber).toBe(
      'TEST-NEW',
    );
    await expect(
      drivers.update('00000000-0000-4000-8000-000000000000', { licenceNumber: 'TEST-X' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('DriversService documents (decision 0060)', () => {
  let drivers: DriversService;
  let storage: FakeObjectStorage;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const t = await createDeliveryTestModule([DriversService, VehiclesService]);
    drivers = t.moduleRef.get(DriversService);
    storage = t.storage;
    cleanup = t.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  const make = () =>
    drivers.create({
      name: 'Test Driver Docs',
      phone: nextPhone(),
      licenceNumber: `TEST-${tag()}`,
    } as never);

  it.each(['licence', 'aadhaar'] as const)(
    'presigns an upload for the %s under drivers/<id>/',
    async (kind) => {
      const d = await make();
      const spy = jest.spyOn(storage, 'presignPost');
      const post = await drivers.createDocumentUploadUrl(d.id, kind, 'image/jpeg');

      const input = (spy.mock.calls[0] as unknown[])[0] as { key: string; contentType: string };
      expect(input.key).toMatch(new RegExp(`^drivers/${d.id}/${kind}-[0-9a-f-]{36}\.jpg$`));
      expect(input.contentType).toBe('image/jpeg');
      expect(post.key).toBe(input.key);
      spy.mockRestore();
    },
  );

  it('rejects a content type other than pdf, jpeg or png', async () => {
    const d = await make();
    await expect(drivers.createDocumentUploadUrl(d.id, 'licence', 'image/gif')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects confirming a key outside drivers/<id>/<kind>-', async () => {
    const d = await make();
    const other = await make();
    for (const key of [
      `drivers/${other.id}/licence-abc.jpg`,
      `drivers/${d.id}/aadhaar-abc.jpg`,
      `artisans/${d.id}/licence-abc.jpg`,
    ]) {
      storage.seed(key);
      await expect(drivers.confirmDocument(d.id, 'licence', key)).rejects.toThrow(
        BadRequestException,
      );
    }
  });

  it('rejects confirming a key that was never uploaded', async () => {
    const d = await make();
    await expect(
      drivers.confirmDocument(d.id, 'licence', `drivers/${d.id}/licence-missing.jpg`),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores the key, and get returns signed view links', async () => {
    const d = await make();
    const licenceKey = `drivers/${d.id}/licence-${tag()}.jpg`;
    const aadhaarKey = `drivers/${d.id}/aadhaar-${tag()}.png`;
    storage.seed(licenceKey);
    storage.seed(aadhaarKey);

    await drivers.confirmDocument(d.id, 'licence', licenceKey);
    const confirmed = await drivers.confirmDocument(d.id, 'aadhaar', aadhaarKey);
    expect(confirmed.licenceDocViewUrl).toContain(licenceKey);
    expect(confirmed.aadhaarDocViewUrl).toContain(aadhaarKey);

    const got = await drivers.get(d.id);
    expect(got.licenceDocViewUrl).toContain(licenceKey);
  });

  it('get shows no link when the driver has no document yet', async () => {
    const d = await make();
    const got = await drivers.get(d.id);
    expect(got.licenceDocViewUrl).toBeNull();
    expect(got.aadhaarDocViewUrl).toBeNull();
  });
});
