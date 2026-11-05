import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Includeable,
  Op,
  QueryTypes,
  Transaction,
  UniqueConstraintError,
  WhereOptions,
} from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AdminCustomerProfileDto,
  AdminDashboardStats,
  AdminUserDetailDto,
  AdminUserDto,
  PaginatedUsersResponse,
  Role,
} from '@golden-abode/types';

import { User } from '../users/models/user.model';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorAccountDetails } from '../vendors/models/vendor-account-details.model';
import { City } from '../catalog/models/city.model';
import { Artisan } from '../artisans/models/artisan.model';
import { ArtisanAccountDetails } from '../artisans/models/artisan-account-details.model';
import { ArtisanTeamMember } from '../artisans/models/artisan-team-member.model';
import { ArtisanHireRequest } from '../artisans/models/artisan-hire-request.model';
import { Customer } from '../customers/models/customer.model';
import { CustomerAddress } from '../customers/models/customer-address.model';
import { toCustomerAddressDto } from '../customers/customer-address.mapper';
import { toAdminUserDto } from './admin-user.mapper';
import { PENDING_VERIFICATION_WHERE } from '../artisans/artisans.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UsersService } from '../users/users.service';
import { ArtisansService } from '../artisans/artisans.service';
import { VendorsService } from '../vendors/vendors.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  private readonly userIncludes: Includeable[] = [
    {
      model: Vendor,
      include: [VendorAccountDetails, City],
    },
    {
      model: Artisan,
      include: [ArtisanAccountDetails, ArtisanTeamMember],
    },
  ];

  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    @InjectModel(Artisan)
    private readonly artisanModel: typeof Artisan,
    @InjectModel(ArtisanHireRequest)
    private readonly artisanHireRequestModel: typeof ArtisanHireRequest,
    @InjectModel(Customer)
    private readonly customerModel: typeof Customer,
    private readonly sequelize: Sequelize,
    private readonly usersService: UsersService,
    private readonly artisansService: ArtisansService,
    private readonly vendorsService: VendorsService,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [
      pendingVendors,
      pendingArtisans,
      totalUsers,
      approvedVendors,
      approvedArtisans,
      pendingArtisanVerifications,
      pendingHireRequests,
      artisansAwaitingDocument,
    ] = await Promise.all([
      // Vendor.status, not User.isApproved=false — a rejected vendor is
      // also isApproved=false, which would double-count as "pending" here
      // otherwise. See decision 0048.
      this.vendorModel.count({ where: { status: 'PENDING' } }),
      this.userModel.count({ where: { role: Role.ARTISAN, isApproved: false } }),
      this.userModel.count(),
      this.userModel.count({ where: { role: Role.VENDOR, isApproved: true } }),
      this.userModel.count({ where: { role: Role.ARTISAN, isApproved: true } }),
      // Artisan-specific, document-backed verification queue — distinct
      // from pendingArtisans (the generic users.is_approved gate). See
      // docs/artisan-module.md §5's two-gate design. Shares its where
      // clause with AdminArtisansService.listPendingVerification so the count
      // and the list it's counting can never drift apart.
      this.artisanModel.count({ where: PENDING_VERIFICATION_WHERE }),
      this.artisanHireRequestModel.count({ where: { status: 'PENDING_ADMIN_REVIEW' } }),
      this.usersService.countArtisansAwaitingDocument(),
    ]);

    return {
      pendingVendors,
      pendingArtisans,
      totalUsers,
      approvedVendors,
      approvedArtisans,
      pendingArtisanVerifications,
      pendingHireRequests,
      artisansAwaitingDocument,
    };
  }

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const where = this.buildListWhereClause(query);

    const { rows, count } = await this.userModel.findAndCountAll({
      where,
      include: this.userIncludes,
      distinct: true,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      items: rows.map(toAdminUserDto),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  async getUserById(userId: string): Promise<AdminUserDetailDto> {
    const user = await this.userModel.findByPk(userId, { include: this.userIncludes });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const [activeSessionCount, customerProfile] = await Promise.all([
      this.countActiveSessions(userId),
      this.customerProfile(userId),
    ]);
    return { ...toAdminUserDto(user), activeSessionCount, customerProfile };
  }

  // Devices still signed in: refresh tokens neither revoked nor expired.
  private async countActiveSessions(userId: string): Promise<number> {
    const [row] = await this.sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM refresh_tokens
        WHERE user_id = :userId AND NOT is_revoked AND expires_at > now()`,
      { replacements: { userId }, type: QueryTypes.SELECT },
    );
    return Number(row.n);
  }

  private async customerProfile(userId: string): Promise<AdminCustomerProfileDto | null> {
    const customer = await this.customerModel.findOne({
      where: { userId },
      include: [CustomerAddress],
    });
    if (!customer) return null;
    // Orders hang off the customer record; hire requests off the user.
    const [totals] = await this.sequelize.query<{
      order_count: string;
      paid_paise: string;
      hire_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM orders WHERE customer_id = :customerId) AS order_count,
         (SELECT coalesce(sum(captured_paise), 0) FROM orders WHERE customer_id = :customerId) AS paid_paise,
         (SELECT count(*) FROM artisan_hire_requests WHERE customer_id = :userId) AS hire_count`,
      { replacements: { customerId: customer.id, userId }, type: QueryTypes.SELECT },
    );
    return {
      customerId: customer.id,
      fullName: customer.fullName,
      addresses: (customer.addresses ?? [])
        .map(toCustomerAddressDto)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      orderCount: Number(totals.order_count),
      paidTotalPaise: Number(totals.paid_paise),
      hireRequestCount: Number(totals.hire_count),
    };
  }

  // Decision 0058 Task 9: fix a user's name, email or phone. Only fields that
  // actually change are written and logged.
  async updateUser(
    userId: string,
    adminUserId: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserDetailDto> {
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const changes: { name?: string; email?: string; phone?: string } = {};
    // typeof, not !== undefined: a null must never get as far as erasing a field.
    if (typeof dto.name === 'string' && dto.name.trim() !== user.name) {
      changes.name = dto.name.trim();
    }
    if (typeof dto.email === 'string') {
      const email = dto.email.trim().toLowerCase();
      if (email !== user.email) changes.email = email;
    }
    if (typeof dto.phone === 'string' && dto.phone !== user.phone) {
      changes.phone = dto.phone;
    }
    const fields = Object.keys(changes);
    if (fields.length === 0) {
      return this.getUserById(userId);
    }

    if (changes.phone && (await this.isTaken('phone', changes.phone, userId))) {
      throw new ConflictException('This phone number is already used by another account');
    }
    if (changes.email && (await this.isTaken('email', changes.email, userId))) {
      throw new ConflictException('This email is already used by another account');
    }
    try {
      await this.sequelize.transaction(async (transaction) => {
        await user.update(changes, { transaction });
        // The customer profile keeps its own copy of the name (set at sign-up).
        if (changes.name) {
          await this.customerModel.update(
            { fullName: changes.name },
            { where: { userId }, transaction },
          );
        }
      });
    } catch (error) {
      // Two admins racing for the same number: the database has the last word.
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException(
          'That phone number or email is already used by another account',
        );
      }
      throw error;
    }
    this.logger.log(`admin ${adminUserId} update user ${userId} ${fields.join(',')}`);
    return this.getUserById(userId);
  }

  // Deactivating also signs the user out everywhere, so a stolen or lost phone
  // stops working at once. Reactivating does not bring old sessions back.
  async setUserActive(
    userId: string,
    adminUserId: string,
    isActive: boolean,
  ): Promise<AdminUserDetailDto> {
    // Compared without case: a UUID in capitals reaches the same row.
    if (!isActive && userId.toLowerCase() === adminUserId.toLowerCase()) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.isActive === isActive) {
      return this.getUserById(userId);
    }
    await this.sequelize.transaction(async (transaction) => {
      await user.update({ isActive }, { transaction });
      if (!isActive) {
        await this.revokeSessions(userId, transaction);
      }
    });
    this.logger.log(
      `admin ${adminUserId} ${isActive ? 'reactivate' : 'deactivate'} user ${userId} ${
        isActive ? 'isActive' : 'isActive,sessions'
      }`,
    );
    return this.getUserById(userId);
  }

  // Refresh tokens stop working at once; an access token already issued lasts
  // until it expires (minutes) unless the account is deactivated too.
  async revokeUserSessions(userId: string, adminUserId: string): Promise<AdminUserDetailDto> {
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    await this.revokeSessions(userId);
    this.logger.log(`admin ${adminUserId} revoke-sessions user ${userId} sessions`);
    return this.getUserById(userId);
  }

  private async revokeSessions(userId: string, transaction?: Transaction): Promise<void> {
    await this.sequelize.query(
      `UPDATE refresh_tokens SET is_revoked = true, updated_at = now()
        WHERE user_id = :userId AND NOT is_revoked`,
      { replacements: { userId }, type: QueryTypes.UPDATE, transaction },
    );
  }

  private async isTaken(field: 'phone' | 'email', value: string, exceptUserId: string) {
    const other = await this.userModel.findOne({
      where: { [field]: value, id: { [Op.ne]: exceptUserId } },
      attributes: ['id'],
    });
    return other !== null;
  }

  // Decision 0058 §3b: for an ustaad, approve/reject here run the same
  // Verify / Reject verification as the verification page, so
  // users.is_approved and artisans.is_verified never disagree.
  async approveUser(userId: string, adminUserId: string): Promise<AdminUserDto> {
    const user = await this.findApprovalTarget(userId);
    if (user.role === Role.ARTISAN) {
      if (!user.artisanProfile) {
        throw new BadRequestException(
          'This ustaad has not created a profile or uploaded a document yet',
        );
      }
      await this.artisansService.verify(user.artisanProfile.id, adminUserId);
    } else if (user.role === Role.VENDOR && user.vendorProfile) {
      // Follow-up F2: keep vendors.status in step (decision 0048).
      await this.vendorsService.approveVendor(user.vendorProfile.id, adminUserId);
    } else {
      await user.update({ isApproved: true });
      this.logger.log(`admin ${adminUserId} approve user ${userId} isApproved (${user.role})`);
    }
    return toAdminUserDto(await user.reload({ include: this.userIncludes }));
  }

  async rejectUser(userId: string, adminUserId: string, reason?: string): Promise<AdminUserDto> {
    const user = await this.findApprovalTarget(userId);
    if (user.role === Role.ARTISAN && user.artisanProfile) {
      await this.artisansService.rejectVerification(user.artisanProfile.id, adminUserId, reason);
    } else if (user.role === Role.VENDOR && user.vendorProfile) {
      // Follow-up F2: a vendor rejection stores its reason (decision 0048).
      if (!reason?.trim()) {
        throw new BadRequestException('A reason is required to reject a vendor');
      }
      await this.vendorsService.rejectVendor(user.vendorProfile.id, adminUserId, reason.trim());
    } else {
      // A vendor with no shop yet, an ustaad with no profile, or any other role:
      // only the account flag exists to change.
      await user.update({ isApproved: false });
      this.logger.log(
        `admin ${adminUserId} reject user ${userId} isApproved (${user.role})${
          reason ? `: ${reason}` : ''
        }`,
      );
    }
    return toAdminUserDto(await user.reload({ include: this.userIncludes }));
  }

  private buildListWhereClause(query: ListUsersQueryDto): WhereOptions<User> {
    const where: WhereOptions<User> = {};

    if (query.role) {
      where.role = query.role;
    }
    if (query.isApproved !== undefined) {
      where.isApproved = query.isApproved;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (!query.search) {
      return where;
    }

    return {
      ...where,
      [Op.or]: [
        { name: { [Op.iLike]: `%${query.search}%` } },
        { phone: { [Op.iLike]: `%${query.search}%` } },
        { email: { [Op.iLike]: `%${query.search}%` } },
      ],
    };
  }

  private async findApprovalTarget(userId: string): Promise<User> {
    const user = await this.userModel.findByPk(userId, { include: this.userIncludes });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== Role.VENDOR && user.role !== Role.ARTISAN) {
      throw new BadRequestException('Only vendors and artisans require approval');
    }
    return user;
  }
}
