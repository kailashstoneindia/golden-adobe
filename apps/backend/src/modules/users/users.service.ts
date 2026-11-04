import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { User } from './models/user.model';
import {
  PaginatedArtisansAwaitingDocumentResponse,
  Role,
  VENDOR_ONBOARDING_STAGES,
  VendorOnboardingStage,
} from '@golden-abode/types';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorAccountDetails } from '../vendors/models/vendor-account-details.model';
import { Artisan } from '../artisans/models/artisan.model';
import { formatTimestamp } from '../vendors/vendor-profile.mapper';

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
    const include =
      role === Role.VENDOR ? [{ model: Vendor, include: [VendorAccountDetails] }] : [];
    return this.userModel.findByPk(id, { include });
  }

  // `transaction` lets AuthService.register write the user and its customers
  // row as one unit. The re-read below must use it too: inside an open
  // transaction the freshly inserted row is invisible to any other connection.
  async create(
    data: { name: string; phone: string; role: Role },
    transaction?: Transaction,
  ): Promise<User> {
    const isVendor = data.role === Role.VENDOR;
    const created = await this.userModel.create(
      {
        name: data.name,
        phone: data.phone,
        role: data.role,
        onboardingCompleted: !isVendor,
        onboardingStage: isVendor ? VENDOR_ONBOARDING_STAGES.basicDetails : null,
      } as any,
      { transaction },
    );
    const user = await this.userModel.findByPk(created.id, { transaction });
    return user!;
  }

  async createAdmin(data: { name: string; email: string; passwordHash: string }): Promise<User> {
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

  // Transaction-aware variant for callers (VendorsService.approveVendor/
  // rejectVendor, decision 0048) that write isApproved alongside their own
  // vendor-specific state in one unit of work.
  async setApproved(userId: string, isApproved: boolean, transaction?: Transaction): Promise<void> {
    await this.userModel.update({ isApproved }, { where: { id: userId }, transaction });
  }

  // Called only from AuthService's real-authentication paths (verifyOtp,
  // register, registerAdmin, loginAdmin) — deliberately NOT from token
  // refresh. See decision 0039.
  async recordLogin(userId: string): Promise<void> {
    await this.userModel.update({ lastLoginAt: new Date() }, { where: { id: userId } });
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

  // ─── Ustaads awaiting a document (decision 0056 §3a) ─────────────────
  // Active ustaads with no artisans row, or a row with no document. They
  // can't be verified yet; the admin lists them to follow up.
  async listArtisansAwaitingDocument(
    page: number,
    limit: number,
  ): Promise<PaginatedArtisansAwaitingDocumentResponse> {
    const { rows, count } = await this.userModel.findAndCountAll({
      ...AWAITING_DOCUMENT_QUERY,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });
    return {
      items: rows.map((user) => ({
        userId: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        hasProfile: Boolean(user.artisanProfile),
        tradeType: user.artisanProfile?.tradeType ?? null,
        servicePincode: user.artisanProfile?.servicePincode ?? null,
        createdAt: formatTimestamp(user.get('createdAt') as Date),
      })),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  async countArtisansAwaitingDocument(): Promise<number> {
    return this.userModel.count(AWAITING_DOCUMENT_QUERY);
  }
}

const AWAITING_DOCUMENT_QUERY = {
  where: {
    role: Role.ARTISAN,
    isActive: true,
    [Op.or]: [{ '$artisanProfile.id$': null }, { '$artisanProfile.document_url$': null }],
  },
  include: [{ model: Artisan, as: 'artisanProfile', required: false }],
  subQuery: false,
  distinct: true,
};
