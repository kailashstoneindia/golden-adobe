import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { AdminDashboardStats, PaginatedUsersResponse, Role, UserDto } from '@golden-abode/types';

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
    if (query.search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${query.search}%` } },
        { phone: { [Op.iLike]: `%${query.search}%` } },
      ];
    }

    return where;
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
    const plain = user.get({ plain: true }) as Record<string, unknown>;
    return {
      id: plain.id as string,
      name: plain.name as string,
      phone: plain.phone as string,
      role: plain.role as Role,
      deviceToken: (plain.deviceToken ?? plain.device_token ?? null) as string | null,
      isActive: (plain.isActive ?? plain.is_active ?? true) as boolean,
      isApproved: (plain.isApproved ?? plain.is_approved ?? false) as boolean,
      createdAt: (plain.createdAt ?? plain.created_at) as string,
      updatedAt: (plain.updatedAt ?? plain.updated_at) as string,
    };
  }
}
