import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './models/user.model';
import { Role } from '../../common/enums/role.enum';
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

  async findById(id: string, role?: Role): Promise<User | null> {
    const include = role === Role.VENDOR ? [{ model: Vendor, include: [VendorAccountDetails] }] : [];
    return this.userModel.findByPk(id, { include });
  }

  async create(data: { name: string; phone: string; role: Role }): Promise<User> {
    const created = await this.userModel.create({
      name: data.name,
      phone: data.phone,
      role: data.role,
    } as any);
    // Re-fetch to guarantee all fields are populated (underscored mapping)
    const user = await this.userModel.findByPk(created.id);
    return user!;
  }

  async updateDeviceToken(userId: string, deviceToken: string): Promise<void> {
    await this.userModel.update({ deviceToken }, { where: { id: userId } });
  }

  async approveUser(userId: string): Promise<void> {
    await this.userModel.update({ isApproved: true }, { where: { id: userId } });
  }
}
