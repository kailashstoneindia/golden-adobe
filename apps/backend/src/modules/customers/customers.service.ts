import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Customer } from './models/customer.model';
import { CustomerAddress } from './models/customer-address.model';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { UpsertCustomerAddressDto } from './dto/upsert-customer-address.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer) private readonly customerModel: typeof Customer,
    @InjectModel(CustomerAddress) private readonly addressModel: typeof CustomerAddress,
  ) {}

  // Mirrors VendorsService.resolveVendorByUserId exactly (same codebase
  // convention: resolve the child row from the authenticated user, never
  // trust an id from a path or body). Every cart/order service calls this
  // first, never queries `customers` directly from a controller.
  async resolveCustomerByUserId(userId: string): Promise<Customer> {
    const customer = await this.customerModel.findOne({ where: { userId } });
    if (!customer) {
      throw new NotFoundException('no customer profile found for this user');
    }
    return customer;
  }

  async getProfile(userId: string): Promise<Customer> {
    return this.resolveCustomerByUserId(userId);
  }

  async updateProfile(userId: string, dto: UpdateCustomerProfileDto): Promise<Customer> {
    const customer = await this.resolveCustomerByUserId(userId);
    customer.fullName = dto.fullName;
    await customer.save();
    return customer;
  }

  async listAddresses(userId: string): Promise<CustomerAddress[]> {
    const customer = await this.resolveCustomerByUserId(userId);
    return this.addressModel.findAll({ where: { customerId: customer.id } });
  }

  async addAddress(userId: string, dto: UpsertCustomerAddressDto): Promise<CustomerAddress> {
    const customer = await this.resolveCustomerByUserId(userId);
    return this.addressModel.create({ ...dto, customerId: customer.id } as CustomerAddress);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpsertCustomerAddressDto,
  ): Promise<CustomerAddress> {
    const customer = await this.resolveCustomerByUserId(userId);
    const address = await this.addressModel.findOne({
      where: { id: addressId, customerId: customer.id },
    });
    if (!address) {
      throw new NotFoundException('address not found');
    }
    // Object.assign would copy keys whose value is `undefined` too (every
    // optional field the caller omitted), and Sequelize treats an
    // `undefined` assignment on a model instance as setting that column to
    // NULL on save — tripping `allowNull: false` on isDefault even when
    // the caller never mentioned it. Only apply keys actually present in
    // the request body.
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        (address as any)[key] = value;
      }
    }
    await address.save();
    return address;
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const customer = await this.resolveCustomerByUserId(userId);
    const deleted = await this.addressModel.destroy({
      where: { id: addressId, customerId: customer.id },
    });
    if (deleted === 0) {
      throw new NotFoundException('address not found');
    }
  }
}
