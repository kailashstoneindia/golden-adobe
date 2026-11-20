import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';

import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { CustomersService } from '../../customers/customers.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { Role } from '@golden-abode/types';

// A customer registered before the customers table existed (2026-10-08) has a
// login but no shopping profile, so every cart/checkout call 404s with "no
// customer profile found for this user". The same state can be produced by
// register itself: the user row and the customers row were two separate
// writes, so a failure in the second left an orphan user nothing repairs.
// These tests pin that the two writes are ONE unit of work.
describe('AuthService.register — customer profile is created atomically', () => {
  let service: AuthService;
  let usersServiceMock: { findByPhone: jest.Mock; create: jest.Mock; recordLogin: jest.Mock };
  let customersServiceMock: { createForUser: jest.Mock };
  let jwtServiceMock: { verify: jest.Mock; sign: jest.Mock };
  let sequelizeMock: { transaction: jest.Mock };
  let refreshTokenModelMock: { create: jest.Mock };

  const transaction = { id: 'txn-1' };
  // generateTokenPair / sanitizeUser read the row through Sequelize's get().
  const makeUser = (role: Role) => {
    const plain = { id: 'user-1', name: 'Asha', phone: '+919999900001', role };
    return { ...plain, get: () => plain };
  };
  const user = makeUser(Role.CUSTOMER);

  beforeEach(async () => {
    usersServiceMock = {
      findByPhone: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(user),
      recordLogin: jest.fn().mockResolvedValue(undefined),
    };
    customersServiceMock = { createForUser: jest.fn().mockResolvedValue({ id: 'cust-1' }) };
    jwtServiceMock = {
      verify: jest.fn().mockReturnValue({ phone: user.phone }),
      sign: jest.fn().mockReturnValue('signed-token'),
    };
    // Mirrors Sequelize: run the callback with a transaction handle; a thrown
    // error inside it propagates (and, for real, rolls the transaction back).
    sequelizeMock = {
      transaction: jest.fn(async (work: (t: unknown) => Promise<unknown>) => work(transaction)),
    };
    refreshTokenModelMock = { create: jest.fn().mockResolvedValue({}) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwtServiceMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, fallback?: unknown) => fallback) },
        },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: CustomersService, useValue: customersServiceMock },
        { provide: RedisService, useValue: {} },
        { provide: Sequelize, useValue: sequelizeMock },
        { provide: getModelToken(RefreshToken), useValue: refreshTokenModelMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('creates the user and the customers row inside the same transaction', async () => {
    await service.register({
      onboardingToken: 'tok',
      name: user.name,
      role: Role.CUSTOMER,
    } as any);

    expect(sequelizeMock.transaction).toHaveBeenCalledTimes(1);
    expect(usersServiceMock.create).toHaveBeenCalledWith(
      { name: user.name, phone: user.phone, role: Role.CUSTOMER },
      transaction,
    );
    expect(customersServiceMock.createForUser).toHaveBeenCalledWith(
      user.id,
      user.name,
      transaction,
    );
  });

  it('does not issue tokens or record a login when the customers row fails', async () => {
    customersServiceMock.createForUser.mockRejectedValue(new Error('db down'));

    await expect(
      service.register({ onboardingToken: 'tok', name: user.name, role: Role.CUSTOMER } as any),
    ).rejects.toThrow('db down');

    // The rejection came out of the transaction callback, which is what makes
    // Sequelize roll the user insert back — no orphan login is left behind.
    expect(usersServiceMock.recordLogin).not.toHaveBeenCalled();
    expect(jwtServiceMock.sign).not.toHaveBeenCalled();
  });

  it('does not create a customers row for a vendor', async () => {
    usersServiceMock.create.mockResolvedValue(makeUser(Role.VENDOR));

    await service.register({
      onboardingToken: 'tok',
      name: user.name,
      role: Role.VENDOR,
    } as any);

    expect(customersServiceMock.createForUser).not.toHaveBeenCalled();
    expect(usersServiceMock.create).toHaveBeenCalledWith(
      { name: user.name, phone: user.phone, role: Role.VENDOR },
      transaction,
    );
  });
});

describe('AuthService.register — role guard (decision 0060)', () => {
  it.each([Role.ADMIN, Role.DRIVER])('refuses self-registration as %s', async (role) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { verify: jest.fn(), sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: UsersService, useValue: { findByPhone: jest.fn(), create: jest.fn() } },
        { provide: CustomersService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: Sequelize, useValue: {} },
        { provide: getModelToken(RefreshToken), useValue: {} },
      ],
    }).compile();

    await expect(
      moduleRef.get(AuthService).register({ onboardingToken: 'tok', name: 'Evil', role } as never),
    ).rejects.toThrow(`${role} role cannot be self-selected`);
  });
});
