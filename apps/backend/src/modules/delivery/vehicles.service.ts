import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError } from 'sequelize';
import type { VehicleDto } from '@golden-abode/types';
import { Vehicle } from './models/vehicle.model';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

export function toVehicleDto(vehicle: Vehicle): VehicleDto {
  return {
    id: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    type: vehicle.type,
    notes: vehicle.notes,
    isActive: vehicle.isActive,
  };
}

@Injectable()
export class VehiclesService {
  constructor(@InjectModel(Vehicle) private readonly vehicleModel: typeof Vehicle) {}

  async create(dto: CreateVehicleDto): Promise<VehicleDto> {
    // Stored uppercased so "dl1c 1234" and "DL1C 1234" are one vehicle.
    const registrationNumber = dto.registrationNumber.trim().toUpperCase();
    try {
      const vehicle = await this.vehicleModel.create({
        registrationNumber,
        type: dto.type.trim(),
        notes: dto.notes?.trim() || null,
      } as never);
      return toVehicleDto(vehicle);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException(`Vehicle ${registrationNumber} is already registered`);
      }
      throw error;
    }
  }

  async list(): Promise<VehicleDto[]> {
    const vehicles = await this.vehicleModel.findAll({ order: [['registrationNumber', 'ASC']] });
    return vehicles.map(toVehicleDto);
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<VehicleDto> {
    const vehicle = await this.vehicleModel.findByPk(id);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${id} not found`);
    }
    if (dto.type !== undefined) vehicle.type = dto.type.trim();
    if (dto.notes !== undefined) vehicle.notes = dto.notes.trim() || null;
    if (dto.isActive !== undefined) vehicle.isActive = dto.isActive;
    await vehicle.save();
    return toVehicleDto(vehicle);
  }
}
