import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction, UniqueConstraintError, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Role } from '@golden-abode/types';
import type { AdminDriverDto, PaginatedResponse } from '@golden-abode/types';
import { User } from '../users/models/user.model';
import { Driver } from './models/driver.model';
import { Vehicle } from './models/vehicle.model';
import { CreateDriverDto, ListDriversQueryDto, UpdateDriverDto } from './dto/driver.dto';
import { toVehicleDto } from './vehicles.service';

@Injectable()
export class DriversService {
  constructor(
    @InjectModel(Driver) private readonly driverModel: typeof Driver,
    @InjectModel(Vehicle) private readonly vehicleModel: typeof Vehicle,
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly sequelize: Sequelize,
  ) {}

  // Decision 0060 rule 12: ops creates the account; the driver then logs in
  // with the existing phone OTP. One transaction so a failed driver row never
  // leaves a stray DRIVER user behind.
  async create(dto: CreateDriverDto): Promise<AdminDriverDto> {
    if (!!dto.helperName !== !!dto.helperPhone) {
      throw new BadRequestException('helperName and helperPhone must be given together');
    }
    try {
      const driverId = await this.sequelize.transaction(async (transaction) => {
        if (await this.userModel.findOne({ where: { phone: dto.phone }, transaction })) {
          throw new ConflictException('This phone number is already used by another account');
        }
        if (dto.vehicleId) {
          await this.assertVehicleAssignable(dto.vehicleId, null, transaction);
        }
        const user = await this.userModel.create(
          {
            name: dto.name.trim(),
            phone: dto.phone,
            role: Role.DRIVER,
            isApproved: true,
            isActive: true,
          } as never,
          { transaction },
        );
        const driver = await this.driverModel.create(
          {
            userId: user.id,
            licenceNumber: dto.licenceNumber.trim(),
            helperName: dto.helperName?.trim() ?? null,
            helperPhone: dto.helperPhone ?? null,
            vehicleId: dto.vehicleId ?? null,
          } as never,
          { transaction },
        );
        return driver.id;
      });
      return this.get(driverId);
    } catch (error) {
      // Two admins racing for the same phone or vehicle: the database decides.
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException('That phone number or vehicle is already in use');
      }
      throw error;
    }
  }

  async get(id: string): Promise<AdminDriverDto> {
    const driver = await this.driverModel.findByPk(id, { include: [User, Vehicle] });
    if (!driver) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    return this.toDto(driver);
  }

  // Both helper fields or neither is checked on the resulting state, so
  // changing just the name of an existing helper is fine.
  async update(id: string, dto: UpdateDriverDto): Promise<AdminDriverDto> {
    const existing = await this.driverModel.findByPk(id, { include: [User] });
    if (!existing) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    const helperName = dto.helperName !== undefined ? dto.helperName : existing.helperName;
    const helperPhone = dto.helperPhone !== undefined ? dto.helperPhone : existing.helperPhone;
    if (!!helperName !== !!helperPhone) {
      throw new BadRequestException('helperName and helperPhone must be given together');
    }
    try {
      await this.sequelize.transaction(async (transaction) => {
        const user = existing.user;
        const userChanges: { name?: string; phone?: string } = {};
        if (dto.name !== undefined && dto.name.trim() !== user.name) {
          userChanges.name = dto.name.trim();
        }
        if (dto.phone !== undefined && dto.phone !== user.phone) {
          const taken = await this.userModel.findOne({
            where: { phone: dto.phone, id: { [Op.ne]: user.id } },
            transaction,
          });
          if (taken) {
            throw new ConflictException('This phone number is already used by another account');
          }
          userChanges.phone = dto.phone;
        }
        if (Object.keys(userChanges).length > 0) {
          await user.update(userChanges, { transaction });
        }
        if (dto.vehicleId) {
          await this.assertVehicleAssignable(dto.vehicleId, existing.id, transaction);
        }
        await existing.update(
          {
            ...(dto.licenceNumber !== undefined && { licenceNumber: dto.licenceNumber.trim() }),
            helperName: helperName?.trim() ?? null,
            helperPhone: helperPhone ?? null,
            ...(dto.vehicleId !== undefined && { vehicleId: dto.vehicleId }),
          },
          { transaction },
        );
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException('That phone number or vehicle is already in use');
      }
      throw error;
    }
    return this.get(id);
  }

  // Document links are signed one by one, so the list leaves them null; open
  // a single driver (get) to see the documents.
  async list(query: ListDriversQueryDto): Promise<PaginatedResponse<AdminDriverDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const userWhere: WhereOptions = {};
    if (query.isActive !== undefined) Object.assign(userWhere, { isActive: query.isActive });
    if (query.search) {
      Object.assign(userWhere, {
        [Op.or]: [
          { name: { [Op.iLike]: `%${query.search}%` } },
          { phone: { [Op.iLike]: `%${query.search}%` } },
        ],
      });
    }
    const { rows, count } = await this.driverModel.findAndCountAll({
      include: [{ model: User, where: userWhere, required: true }, Vehicle],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });
    return {
      items: rows.map((d) => this.toListDto(d)),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  // The vehicle must exist, be active, and not already be another driver's.
  private async assertVehicleAssignable(
    vehicleId: string,
    exceptDriverId: string | null,
    transaction?: Transaction,
  ): Promise<void> {
    const vehicle = await this.vehicleModel.findByPk(vehicleId, { transaction });
    if (!vehicle || !vehicle.isActive) {
      throw new BadRequestException('vehicleId does not match an active vehicle');
    }
    const holder = await this.driverModel.findOne({ where: { vehicleId }, transaction });
    if (holder && holder.id !== exceptDriverId) {
      throw new ConflictException('That vehicle is already assigned to another driver');
    }
  }

  private toListDto(driver: Driver): AdminDriverDto {
    return {
      id: driver.id,
      userId: driver.userId,
      name: driver.user.name,
      phone: driver.user.phone ?? '',
      isActive: driver.user.isActive,
      licenceNumber: driver.licenceNumber,
      helperName: driver.helperName,
      helperPhone: driver.helperPhone,
      vehicle: driver.vehicle ? toVehicleDto(driver.vehicle) : null,
      licenceDocViewUrl: null,
      aadhaarDocViewUrl: null,
    };
  }

  private async toDto(driver: Driver): Promise<AdminDriverDto> {
    return this.toListDto(driver);
  }
}
