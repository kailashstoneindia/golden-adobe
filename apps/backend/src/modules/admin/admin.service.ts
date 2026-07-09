import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import {
  AdminDashboardStats,
  PaginatedUsersResponse,
  Role,
  UserDto,
  VENDOR_ONBOARDING_STAGES,
} from '@golden-abode/types';

import { User } from '../users/models/user.model';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User)
    private readonly userModel: typeof User,
  ) {}

  async getDashboardStats(): Promise<AdminDashboardStats> {
    const [pendingVendors, pendingArtisans, totalUsers, approvedVendors, approvedArtisans] =
      await Promise.all([
        this.userModel.count({ where: { role: Role.VENDOR, isApproved: false } }),
        this.userModel.count({ where: { role: Role.ARTISAN, isApproved: false } }),
        this.userModel.count(),
        this.userModel.count({ where: { role: Role.VENDOR, isApproved: true } }),
        this.userModel.count({ where: { role: Role.ARTISAN, isApproved: true } }),
      ]);

    return {
      pendingVendors,
      pendingArtisans,
      totalUsers,
      approvedVendors,
      approvedArtisans,
    };
  }

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedUsersResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const where = this.buildListWhereClause(query);

    const { rows, count } = await this.userModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return {
      items: rows.map((user) => this.toUserDto(user)),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  async getUserById(userId: string): Promise<UserDto> {
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return this.toUserDto(user);
  }

  async approveUser(userId: string): Promise<UserDto> {
    const user = await this.findApprovalTarget(userId);
    await user.update({ isApproved: true });
    this.logger.log(`Approved user ${userId} (${user.role})`);
    return this.toUserDto(await user.reload());
  }

  async rejectUser(userId: string, reason?: string): Promise<UserDto> {
    const user = await this.findApprovalTarget(userId);
    await user.update({ isApproved: false });
    this.logger.log(`Rejected user ${userId} (${user.role})${reason ? `: ${reason}` : ''}`);
    return this.toUserDto(await user.reload());
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
      ],
    };
  }

  private async findApprovalTarget(userId: string): Promise<User> {
    const user = await this.userModel.findByPk(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.role !== Role.VENDOR && user.role !== Role.ARTISAN) {
      throw new BadRequestException('Only vendors and artisans require approval');
    }
    return user;
  }

  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role as Role,
      deviceToken: user.deviceToken,
      isActive: user.isActive,
      isApproved: user.isApproved,
      onboardingCompleted: user.onboardingCompleted ?? Boolean(user.vendorProfile),
      onboardingCompletedAt: this.formatTimestamp(user.get('onboardingCompletedAt')) || null,
      onboardingStage:
        (user.onboardingStage as UserDto['onboardingStage']) ??
        (user.vendorProfile ? VENDOR_ONBOARDING_STAGES.completed : null),
      createdAt: this.formatTimestamp(user.get('createdAt')),
      updatedAt: this.formatTimestamp(user.get('updatedAt')),
    };
  }

  private formatTimestamp(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    return '';
  }
}
