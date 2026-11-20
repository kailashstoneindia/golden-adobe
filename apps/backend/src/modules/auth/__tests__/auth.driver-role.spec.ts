import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@golden-abode/types';

import { AuthService } from '../auth.service';
import { UsersService } from '../../users/users.service';
import { CustomersService } from '../../customers/customers.service';
import { RedisService } from '../../../core/redis/redis.service';
import { RefreshToken } from '../../users/models/refresh-token.model';
import { ListUsersQueryDto } from '../../admin/dto/list-users-query.dto';

describe('DRIVER role around the edges (decision 0060)', () => {
  it('getProfile returns a driver without crashing', async () => {
    const plain = { id: 'd1', name: 'Test Driver', phone: '+919811100002', role: Role.DRIVER };
    const findById = jest.fn(async () => ({ ...plain, get: () => plain }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: UsersService, useValue: { findById } },
        { provide: CustomersService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: Sequelize, useValue: {} },
        { provide: getModelToken(RefreshToken), useValue: {} },
      ],
    }).compile();

    const profile = await moduleRef.get(AuthService).getProfile('d1', Role.DRIVER);
    expect(profile).toMatchObject({ id: 'd1', role: Role.DRIVER, isActive: true });
    expect(findById).toHaveBeenCalledWith('d1', Role.DRIVER);
  });

  it('the admin user list accepts role=DRIVER', async () => {
    const errors = await validate(plainToInstance(ListUsersQueryDto, { role: 'DRIVER' }));
    expect(errors).toHaveLength(0);
  });
});
