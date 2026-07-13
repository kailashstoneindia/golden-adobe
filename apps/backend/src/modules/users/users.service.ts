import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './models/user.model';
import {
  Role,
  VENDOR_ONBOARDING_STAGES,
  VendorOnboardingStage,
} from '@golden-abode/types';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorAccountDetails } from '../vendors/models/vendor-account-details.model';


@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ where: { phone } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ where: { email } });
  }

  async findById(id: string, role?: Role): Promise<User | null> {
    const include = role === Role.VENDOR ? [{ model: Vendor, include: [VendorAccountDetails] }] : [];
    return this.userModel.findByPk(id, { include });
  }

  async create(data: { name: string; phone: string; role: Role }): Promise<User> {
    const isVendor = data.role === Role.VENDOR;
    const created = await this.userModel.create({
      name: data.name,
      phone: data.phone,
      role: data.role,
      onboardingCompleted: !isVendor,
      onboardingStage: isVendor ? VENDOR_ONBOARDING_STAGES.basicDetails : null,
    } as any);
    const user = await this.userModel.findByPk(created.id);
    return user!;
  }

  async createAdmin(data: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    const created = await this.userModel.create({
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash,
      phone: null,
      role: Role.ADMIN,
      isApproved: true,
      onboardingCompleted: true,
      onboardingStage: null,
    } as any);
    const user = await this.userModel.findByPk(created.id);
    return user!;
  }

  async updateDeviceToken(userId: string, deviceToken: string): Promise<void> {
    await this.userModel.update({ deviceToken }, { where: { id: userId } });
  }

  async approveUser(userId: string): Promise<void> {
    await this.userModel.update({ isApproved: true }, { where: { id: userId } });
  }

  async updateVendorOnboardingProgress(
    userId: string,
    onboardingStage: VendorOnboardingStage,
  ): Promise<void> {
    await this.userModel.update(
      {
        onboardingStage,
      },
      { where: { id: userId } },
    );
  }

  async markVendorOnboardingCompleted(userId: string): Promise<void> {
    await this.userModel.update(
      {
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStage: VENDOR_ONBOARDING_STAGES.completed,
      },
      { where: { id: userId } },
    );
  }
}
