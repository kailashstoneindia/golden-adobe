import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Vendor } from './models/vendor.model';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { UsersService } from '../users/users.service';
import { VENDOR_ONBOARDING_STAGES, VendorOnboardingStage } from '@golden-abode/types';

@Injectable()
export class VendorsService {
  constructor(
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    @InjectModel(VendorAccountDetails)
    private readonly vendorAccountDetailsModel: typeof VendorAccountDetails,
    private readonly usersService: UsersService,
  ) {}

  async createProfile(userId: string, dto: OnboardVendorDto): Promise<Vendor> {
    const existingProfile = await this.vendorModel.findOne({ where: { userId } });
    
    if (existingProfile) {
      throw new ConflictException('Vendor profile already exists for this user');
    }

    const vendorProfile = await this.vendorModel.create({
      userId,
      shopName: dto.shopName,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      upiId: dto.upiId,
      bankDetails: dto.bankDetails,
      gstin: dto.gstin,
    } as any);

    await this.vendorAccountDetailsModel.create({
      vendorId: vendorProfile.id,
      accountHolderName: dto.accountDetails.accountHolderName,
      bankName: dto.accountDetails.bankName,
      ifscCode: dto.accountDetails.ifscCode,
      branchName: dto.accountDetails.branchName,
      accountNumber: dto.accountDetails.accountNumber,
    } as any);

    const vendorProfileWithAccountDetails = await this.vendorModel.findByPk(vendorProfile.id, {
      include: [VendorAccountDetails],
    });

    if (!vendorProfileWithAccountDetails) {
      throw new ConflictException('Vendor profile could not be loaded after creation');
    }

    await this.usersService.markVendorOnboardingCompleted(userId);

    return vendorProfileWithAccountDetails;
  }

  async updateOnboardingProgress(
    userId: string,
    onboardingStage: VendorOnboardingStage,
  ): Promise<void> {
    if (onboardingStage === VENDOR_ONBOARDING_STAGES.completed) {
      return;
    }

    await this.usersService.updateVendorOnboardingProgress(userId, onboardingStage);
  }
}
