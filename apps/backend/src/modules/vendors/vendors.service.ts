import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Vendor } from './models/vendor.model';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { UpdateAccountDetailsDto } from './dto/update-account-details.dto';
import { VendorAccountDetails } from './models/vendor-account-details.model';
import { City } from '../catalog/models/city.model';
import { CityResolverService } from '../catalog/city-resolver.service';
import { UsersService } from '../users/users.service';
import { toVendorProfileDto } from './vendor-profile.mapper';
import { VENDOR_ONBOARDING_STAGES, VendorOnboardingStage, VendorProfileDto } from '@golden-abode/types';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    @InjectModel(VendorAccountDetails)
    private readonly vendorAccountDetailsModel: typeof VendorAccountDetails,
    private readonly usersService: UsersService,
    private readonly cityResolver: CityResolverService,
    private readonly sequelize: Sequelize,
  ) {}

  // Shared by three controllers (vendor profile, catalog import, and the
  // stock endpoints to come) — the pattern previously lived privately in
  // VendorCatalogImportController, which meant every new vendor-scoped
  // controller re-implemented "which vendor is this caller".
  async resolveVendorByUserId(userId: string): Promise<Vendor> {
    const vendor = await this.vendorModel.findOne({ where: { userId } });
    if (!vendor) {
      throw new NotFoundException('no vendor profile found for this user');
    }
    return vendor;
  }

  // Returns the mapped DTO, not the raw model: apps/mobile already types
  // this response as VendorProfileDto (vendor.service.ts), but the raw
  // model serialized with snake_case timestamps and no city shape, so the
  // client's type was a fiction. Now that the mapper exists it costs
  // nothing to make the response match what the caller already believes.
  async createProfile(userId: string, dto: OnboardVendorDto): Promise<VendorProfileDto> {
    const existingProfile = await this.vendorModel.findOne({ where: { userId } });

    if (existingProfile) {
      throw new ConflictException('Vendor profile already exists for this user');
    }

    // Resolved BEFORE the transaction opens: this reads the city table and
    // never writes, so holding a transaction open across it buys nothing
    // and keeps a write lock alive for the duration of the lookup.
    const cityId = await this.resolveCityFromCoordinates(dto.latitude, dto.longitude);

    // The vendor row and its account-details row are one unit of work. Two
    // bare creates left an orphan vendor with no bank details behind
    // whenever the second failed — recoverable only by hand, and invisible
    // until a payout was attempted.
    const vendorId = await this.sequelize.transaction(async (transaction) => {
      const vendorProfile = await this.vendorModel.create(
        {
          userId,
          shopName: dto.shopName,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          upiId: dto.upiId,
          bankDetails: dto.bankDetails,
          gstin: dto.gstin,
          cityId,
          citySource: cityId ? 'gps' : null,
        } as any,
        { transaction },
      );

      await this.vendorAccountDetailsModel.create(
        {
          vendorId: vendorProfile.id,
          accountHolderName: dto.accountDetails.accountHolderName,
          bankName: dto.accountDetails.bankName,
          ifscCode: dto.accountDetails.ifscCode,
          branchName: dto.accountDetails.branchName,
          accountNumber: dto.accountDetails.accountNumber,
        } as any,
        { transaction },
      );

      return vendorProfile.id;
    });

    // Outside the transaction: this touches the users table via another
    // service and is idempotent, and folding it in would mean threading a
    // transaction through UsersService for no integrity gain — a vendor
    // whose onboarding flag lags by one request is not a broken record.
    await this.usersService.markVendorOnboardingCompleted(userId);

    const created = await this.findByIdOrThrow(vendorId);
    if (!cityId) {
      this.logger.warn(
        `vendor ${vendorId} onboarded with no resolvable city from (${dto.latitude}, ${dto.longitude}) — they will be invisible to city-scoped search until a city is set`,
      );
    }
    return toVendorProfileDto(created);
  }

  async getProfileByUserId(userId: string): Promise<VendorProfileDto> {
    const vendor = await this.resolveVendorByUserId(userId);
    return toVendorProfileDto(await this.findByIdOrThrow(vendor.id));
  }

  async updateProfile(userId: string, dto: UpdateVendorProfileDto): Promise<VendorProfileDto> {
    const vendor = await this.resolveVendorByUserId(userId);

    const updates: Partial<Vendor> = {};
    if (dto.shopName !== undefined) updates.shopName = dto.shopName;
    if (dto.address !== undefined) updates.address = dto.address;
    if (dto.upiId !== undefined) updates.upiId = dto.upiId;
    if (dto.bankDetails !== undefined) updates.bankDetails = dto.bankDetails;
    if (dto.gstin !== undefined) updates.gstin = dto.gstin;

    // Coordinates arrive as a pair (the DTO enforces it), so testing
    // latitude alone is enough to know the position moved.
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      updates.latitude = dto.latitude;
      updates.longitude = dto.longitude;

      // An admin override is sticky. Re-resolving here would let a vendor
      // silently undo a correction by editing their address, which is
      // exactly the conflict city_source exists to settle.
      if (vendor.citySource === 'admin') {
        this.logger.log(
          `vendor ${vendor.id} moved coordinates but keeps admin-pinned city ${vendor.cityId}`,
        );
      } else {
        const cityId = await this.resolveCityFromCoordinates(dto.latitude, dto.longitude);
        // Only overwrite on a successful resolve: a vendor who drags a pin
        // somewhere unresolvable should keep the city they had rather than
        // dropping out of search entirely.
        if (cityId) {
          updates.cityId = cityId;
          updates.citySource = 'gps';
        } else {
          this.logger.warn(
            `vendor ${vendor.id} moved to (${dto.latitude}, ${dto.longitude}) with no resolvable city — keeping existing city ${vendor.cityId}`,
          );
        }
      }
    }

    await this.vendorModel.update(updates, { where: { id: vendor.id } });
    return toVendorProfileDto(await this.findByIdOrThrow(vendor.id));
  }

  // Update-or-create, never a second row: vendor_account_details.vendorId
  // is unique, so a plain create on an existing vendor raises a constraint
  // error instead of updating.
  async updateAccountDetails(
    userId: string,
    dto: UpdateAccountDetailsDto,
  ): Promise<VendorProfileDto> {
    const vendor = await this.resolveVendorByUserId(userId);

    const existing = await this.vendorAccountDetailsModel.findOne({
      where: { vendorId: vendor.id },
    });

    if (existing) {
      await this.vendorAccountDetailsModel.update(
        {
          accountHolderName: dto.accountHolderName,
          bankName: dto.bankName,
          ifscCode: dto.ifscCode,
          branchName: dto.branchName,
          accountNumber: dto.accountNumber,
        },
        { where: { vendorId: vendor.id } },
      );
    } else {
      await this.vendorAccountDetailsModel.create({
        vendorId: vendor.id,
        accountHolderName: dto.accountHolderName,
        bankName: dto.bankName,
        ifscCode: dto.ifscCode,
        branchName: dto.branchName,
        accountNumber: dto.accountNumber,
      } as any);
    }

    return toVendorProfileDto(await this.findByIdOrThrow(vendor.id));
  }

  async listVendors(): Promise<VendorProfileDto[]> {
    const vendors = await this.vendorModel.findAll({
      include: [VendorAccountDetails, City],
      order: [['createdAt', 'DESC']],
    });
    return vendors.map((vendor) => toVendorProfileDto(vendor));
  }

  async getVendorById(vendorId: string): Promise<VendorProfileDto> {
    return toVendorProfileDto(await this.findByIdOrThrow(vendorId));
  }

  // The admin override (decision 0019). Passing null clears the pin and
  // hands the city back to GPS resolution on the vendor's next address
  // change — it does NOT immediately re-resolve, because an admin clearing
  // an override is saying "stop pinning", not "recompute now".
  async setVendorCity(vendorId: string, cityId: string | null): Promise<VendorProfileDto> {
    await this.findByIdOrThrow(vendorId);

    if (cityId) {
      const city = await City.findByPk(cityId);
      if (!city) {
        throw new NotFoundException(`city ${cityId} not found`);
      }
      if (!city.isActive) {
        // An inactive city is not searchable, so pinning a vendor to one
        // removes them from results as surely as leaving city_id null.
        throw new ConflictException(
          `city ${city.name} is not active — pinning a vendor to it would hide them from search`,
        );
      }
    }

    await this.vendorModel.update(
      { cityId, citySource: cityId ? 'admin' : null },
      { where: { id: vendorId } },
    );

    return toVendorProfileDto(await this.findByIdOrThrow(vendorId));
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

  private async findByIdOrThrow(vendorId: string): Promise<Vendor> {
    const vendor = await this.vendorModel.findByPk(vendorId, {
      include: [VendorAccountDetails, City],
    });
    if (!vendor) {
      throw new NotFoundException(`vendor ${vendorId} not found`);
    }
    return vendor;
  }

  // City resolution must never be the reason onboarding fails — a vendor
  // blocked from signing up because the city table is empty or a centroid
  // is malformed is a far worse outcome than a vendor with a null city,
  // which an admin can fix with the override.
  private async resolveCityFromCoordinates(
    latitude: number,
    longitude: number,
  ): Promise<string | null> {
    try {
      return await this.cityResolver.resolveNearestCity(latitude, longitude);
    } catch (error) {
      this.logger.error(
        `city resolution failed for (${latitude}, ${longitude}): ${(error as Error).message}`,
      );
      return null;
    }
  }
}
