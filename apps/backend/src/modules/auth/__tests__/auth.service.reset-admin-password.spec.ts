import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { CustomersService } from '../../customers/customers.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { Role } from '@golden-abode/types';

const REGISTRATION_SECRET = 'test-admin-registration-secret';

describe('AuthService.resetAdminPassword (decision 0050)', () => {
  let service: AuthService;
  let usersServiceMock: { findByEmail: jest.Mock };
  let refreshTokenModelMock: { update: jest.Mock };
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    usersServiceMock = { findByEmail: jest.fn() };
    refreshTokenModelMock = { update: jest.fn() };
    configServiceMock = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'admin.registrationSecret') return REGISTRATION_SECRET;
        return fallback;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: CustomersService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: Sequelize, useValue: {} },
        { provide: getModelToken(RefreshToken), useValue: refreshTokenModelMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  function adminUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'admin-1',
      email: 'admin@kailashstones.com',
      role: Role.ADMIN,
      update: jest.fn(),
      ...overrides,
    };
  }

  it('resets the password and revokes every refresh token for the admin', async () => {
    const user = adminUser();
    usersServiceMock.findByEmail.mockResolvedValue(user);

    const result = await service.resetAdminPassword({
      email: 'Admin@KailashStones.com',
      newPassword: 'BrandNewPass123',
      secretKey: REGISTRATION_SECRET,
    });

    expect(result).toEqual({ success: true });
    expect(usersServiceMock.findByEmail).toHaveBeenCalledWith('admin@kailashstones.com');
    expect(user.update).toHaveBeenCalledTimes(1);
    const passwordHash = (user.update as jest.Mock).mock.calls[0][0].passwordHash;
    expect(await bcrypt.compare('BrandNewPass123', passwordHash)).toBe(true);
    expect(refreshTokenModelMock.update).toHaveBeenCalledWith(
      { isRevoked: true },
      { where: { userId: 'admin-1' } },
    );
  });

  it('rejects an invalid secret before touching the user at all', async () => {
    await expect(
      service.resetAdminPassword({
        email: 'admin@kailashstones.com',
        newPassword: 'BrandNewPass123',
        secretKey: 'wrong-secret',
      }),
    ).rejects.toThrow('Invalid registration secret');

    expect(usersServiceMock.findByEmail).not.toHaveBeenCalled();
    expect(refreshTokenModelMock.update).not.toHaveBeenCalled();
  });

  it('404s for an email with no account', async () => {
    usersServiceMock.findByEmail.mockResolvedValue(null);

    await expect(
      service.resetAdminPassword({
        email: 'nobody@kailashstones.com',
        newPassword: 'BrandNewPass123',
        secretKey: REGISTRATION_SECRET,
      }),
    ).rejects.toThrow('No admin account with this email');

    expect(refreshTokenModelMock.update).not.toHaveBeenCalled();
  });

  it('404s for a non-admin account — this is not a generic account-takeover path', async () => {
    usersServiceMock.findByEmail.mockResolvedValue(adminUser({ role: Role.CUSTOMER }));

    await expect(
      service.resetAdminPassword({
        email: 'customer@example.com',
        newPassword: 'BrandNewPass123',
        secretKey: REGISTRATION_SECRET,
      }),
    ).rejects.toThrow('No admin account with this email');

    expect(refreshTokenModelMock.update).not.toHaveBeenCalled();
  });
});
