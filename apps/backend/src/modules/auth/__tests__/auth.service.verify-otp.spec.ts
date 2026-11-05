import crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/sequelize';
import { UnauthorizedException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { CustomersService } from '../../customers/customers.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RefreshToken } from '../../users/models/refresh-token.model';

// Decision 0058 Task 9: an admin deactivates an account; that account must
// not get a fresh login from a correct OTP either.
describe('AuthService.verifyOtp — deactivated accounts', () => {
  const phone = '+916375620145';
  const otp = '123456';

  async function build(user: { id: string; isActive: boolean } | null) {
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    const store = new Map<string, string>([[`otp:${phone}`, hash]]);
    const refreshTokenModel = { create: jest.fn(async () => ({})) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { sign: jest.fn(() => 'signed') } },
        { provide: ConfigService, useValue: { get: jest.fn((_k: string, d?: unknown) => d) } },
        {
          provide: UsersService,
          useValue: { findByPhone: jest.fn(async () => user), recordLogin: jest.fn() },
        },
        { provide: CustomersService, useValue: {} },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(async (key: string) => store.get(key) ?? null),
            set: jest.fn(),
            del: jest.fn(async (key: string) => store.delete(key)),
          },
        },
        { provide: Sequelize, useValue: {} },
        { provide: getModelToken(RefreshToken), useValue: refreshTokenModel },
      ],
    }).compile();
    return { service: moduleRef.get(AuthService), refreshTokenModel };
  }

  it('refuses a deactivated user and issues no tokens', async () => {
    const { service, refreshTokenModel } = await build({ id: 'u1', isActive: false });

    await expect(service.verifyOtp({ phone, otp } as never)).rejects.toThrow(
      new UnauthorizedException('Account is deactivated'),
    );
    expect(refreshTokenModel.create).not.toHaveBeenCalled();
  });

  it('still logs an active user in', async () => {
    const plain = { id: 'u1', isActive: true, name: 'A', role: 'CUSTOMER' };
    const { service } = await build({ ...plain, get: () => plain } as never);
    jest
      .spyOn(service as unknown as { generateTokenPair: () => unknown }, 'generateTokenPair')
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' } as never);

    await expect(service.verifyOtp({ phone, otp } as never)).resolves.toMatchObject({
      isNewUser: false,
      accessToken: 'a',
    });
  });
});
