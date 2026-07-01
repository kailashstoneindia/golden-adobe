import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Vendor } from './models/vendor.model';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
  ) {}

  async createProfile(userId: string, dto: OnboardVendorDto): Promise<Vendor> {
    const existingProfile = await this.vendorModel.findOne({ where: { userId } });
    
    if (existingProfile) {
      throw new ConflictException('Vendor profile already exists for this user');
    }

    return this.vendorModel.create({
      userId,
      ...dto,
    } as any);
  }
}
