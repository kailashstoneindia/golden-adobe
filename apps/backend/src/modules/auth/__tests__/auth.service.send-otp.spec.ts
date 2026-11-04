import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/sequelize';
import { BadRequestException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';

import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { CustomersService } from '../../customers/customers.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RefreshToken } from '../../users/models/refresh-token.model';

// The per-phone send limit exists to stop SMS spam and SMS cost. In demo mode
// (USE_MSG91_SMS=false) no SMS is sent or billed and the code is returned in
// the response, so the limit protects nothing and only locks testers out of
// their own accounts. It must come back automatically when real SMS is on.
describe('AuthService.sendOtp — send limit applies only when real SMS is on', () => {
  const phone = '+916375620145';

  async function build(useSms: boolean) {
    const store = new Map<string, string>();
    const redisMock = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const configMock = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'msg91.useSms') return useSms;
        if (key === 'throttle.otpSendLimit') return 3;
        return fallback;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: configMock },
        { provide: UsersService, useValue: {} },
        { provide: CustomersService, useValue: {} },
        { provide: RedisService, useValue: redisMock },
        { provide: Sequelize, useValue: {} },
        { provide: getModelToken(RefreshToken), useValue: {} },
      ],
    }).compile();

    const service = moduleRef.get(AuthService);
    // Real-SMS mode would call MSG91 over HTTP; the limit logic is what is
    // under test, not the provider.
    jest
      .spyOn(service as unknown as { sendViaMSG91: () => Promise<void> }, 'sendViaMSG91')
      .mockResolvedValue(undefined);
    return { service, redisMock };
  }

  it('demo mode: never blocks, however many times the same number asks', async () => {
    const { service } = await build(false);

    for (let i = 0; i < 10; i += 1) {
      await expect(service.sendOtp({ phone } as never)).resolves.toMatchObject({
        message: 'OTP sent successfully (demo)',
        devOtp: '123456',
      });
    }
  });

  it('demo mode: does not write a send counter, so switching to real SMS starts clean', async () => {
    const { service, redisMock } = await build(false);

    await service.sendOtp({ phone } as never);

    const writtenKeys = redisMock.set.mock.calls.map((call) => call[0] as string);
    expect(writtenKeys).toContain(`otp:${phone}`); // the OTP itself is still stored
    expect(writtenKeys).not.toContain(`otp_rate:${phone}`);
  });

  it('real SMS mode: still blocks the 4th send inside the window', async () => {
    const { service } = await build(true);

    for (let i = 0; i < 3; i += 1) {
      await expect(service.sendOtp({ phone } as never)).resolves.toMatchObject({
        message: 'OTP sent successfully',
      });
    }
    await expect(service.sendOtp({ phone } as never)).rejects.toThrow(BadRequestException);
  });
});
