import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  ArtisanAccountDetailsDto,
  ArtisanAccountDetailsInputDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  ArtisanTeamMemberDto,
  ArtisanTeamMemberInputDto,
} from '@golden-abode/types';

import { Artisan } from './models/artisan.model';
import { ArtisanAccountDetails } from './models/artisan-account-details.model';
import { ArtisanTeamMember } from './models/artisan-team-member.model';
import { OnboardArtisanDto } from './dto/onboard-artisan.dto';
import { UpdateArtisanProfileDto } from './dto/update-artisan-profile.dto';
import {
  toAccountDetailsDto,
  toArtisanProfileDto,
  toArtisanPublicProfileDto,
  toTeamMemberDto,
} from './artisan-profile.mapper';
import {
  OBJECT_STORAGE,
  ObjectStorage,
  PresignedPost,
} from '../catalog/media/object-storage';

const DEFAULT_INCLUDES = [ArtisanAccountDetails, ArtisanTeamMember];

// Mirrors the storage.config.ts defaults MediaService uses for product
// media presigns — this module has no document-specific config of its
// own, and inventing one is not worth it for a single upload shape.
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_PRESIGN_TTL_SECONDS = 300;
const ALLOWED_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

@Injectable()
export class ArtisansService {
  constructor(
    @InjectModel(Artisan)
    private readonly artisanModel: typeof Artisan,
    @InjectModel(ArtisanAccountDetails)
    private readonly artisanAccountDetailsModel: typeof ArtisanAccountDetails,
    @InjectModel(ArtisanTeamMember)
    private readonly artisanTeamMemberModel: typeof ArtisanTeamMember,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // Shared by the controller to resolve "which artisan is this caller" —
  // same role VendorsService.resolveVendorByUserId plays for vendors.
  async resolveArtisanByUserId(userId: string): Promise<Artisan> {
    const artisan = await this.artisanModel.findOne({ where: { userId } });
    if (!artisan) {
      throw new NotFoundException('no artisan profile found for this user');
    }
    return artisan;
  }

  async onboardProfile(userId: string, dto: OnboardArtisanDto): Promise<ArtisanProfileDto> {
    const existing = await this.artisanModel.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Artisan profile already exists for this user');
    }

    const created = await this.artisanModel.create({
      userId,
      tradeType: dto.tradeType,
      experienceYears: dto.experienceYears ?? null,
      bio: dto.bio ?? null,
      servicePincode: dto.servicePincode ?? null,
    } as never);

    return toArtisanProfileDto(await this.findByIdOrThrow(created.id));
  }

  async getOwnProfile(userId: string): Promise<ArtisanProfileDto> {
    const artisan = await this.resolveArtisanByUserId(userId);
    return toArtisanProfileDto(await this.findByIdOrThrow(artisan.id));
  }

  async updateProfile(userId: string, dto: UpdateArtisanProfileDto): Promise<ArtisanProfileDto> {
    const artisan = await this.resolveArtisanByUserId(userId);

    const updates: Partial<Artisan> = {};
    if (dto.tradeType !== undefined) updates.tradeType = dto.tradeType;
    if (dto.experienceYears !== undefined) updates.experienceYears = dto.experienceYears;
    if (dto.bio !== undefined) updates.bio = dto.bio;
    if (dto.servicePincode !== undefined) updates.servicePincode = dto.servicePincode;
    if (dto.isAvailable !== undefined) updates.isAvailable = dto.isAvailable;

    await this.artisanModel.update(updates, { where: { id: artisan.id } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisan.id));
  }

  // Update-or-create, never a second row: artisan_account_details.artisanId
  // is unique, so a plain create on an existing artisan raises a
  // constraint error instead of updating.
  async upsertAccountDetails(
    userId: string,
    dto: ArtisanAccountDetailsInputDto,
  ): Promise<ArtisanAccountDetailsDto> {
    const artisan = await this.resolveArtisanByUserId(userId);

    const existing = await this.artisanAccountDetailsModel.findOne({
      where: { artisanId: artisan.id },
    });

    if (existing) {
      await this.artisanAccountDetailsModel.update(
        {
          accountHolderName: dto.accountHolderName,
          bankName: dto.bankName,
          ifscCode: dto.ifscCode,
          branchName: dto.branchName,
          accountNumber: dto.accountNumber,
        },
        { where: { artisanId: artisan.id } },
      );
    } else {
      await this.artisanAccountDetailsModel.create({
        artisanId: artisan.id,
        accountHolderName: dto.accountHolderName,
        bankName: dto.bankName,
        ifscCode: dto.ifscCode,
        branchName: dto.branchName,
        accountNumber: dto.accountNumber,
      } as never);
    }

    const updated = await this.artisanAccountDetailsModel.findOne({
      where: { artisanId: artisan.id },
    });
    return toAccountDetailsDto(updated)!;
  }

  async createUploadUrl(userId: string, contentType: string): Promise<PresignedPost> {
    const artisan = await this.resolveArtisanByUserId(userId);

    if (!ALLOWED_DOCUMENT_CONTENT_TYPES.includes(contentType)) {
      throw new BadRequestException('contentType must be application/pdf, image/jpeg or image/png');
    }

    const extension = contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1];
    const key = `artisans/${artisan.id}/doc-${randomUUID()}.${extension}`;

    return this.storage.presignPost({
      key,
      contentType,
      maxBytes: DOCUMENT_MAX_BYTES,
      expiresInSeconds: DOCUMENT_PRESIGN_TTL_SECONDS,
    });
  }

  // Sets documentUrl after the client confirms the direct-to-S3 upload
  // completed. The key must fall under this artisan's own upload-url
  // prefix (artisans/<artisanId>/...) — otherwise a caller could confirm
  // an arbitrary S3 key as if it were their own document.
  async confirmDocumentUpload(userId: string, key: string): Promise<ArtisanProfileDto> {
    const artisan = await this.resolveArtisanByUserId(userId);

    if (!key.startsWith(`artisans/${artisan.id}/`)) {
      throw new BadRequestException("key does not belong to this artisan's own upload");
    }

    await this.artisanModel.update({ documentUrl: key }, { where: { id: artisan.id } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisan.id));
  }

  async addTeamMember(
    userId: string,
    dto: ArtisanTeamMemberInputDto,
  ): Promise<ArtisanTeamMemberDto> {
    const artisan = await this.resolveArtisanByUserId(userId);

    const member = await this.artisanTeamMemberModel.create({
      artisanId: artisan.id,
      name: dto.name ?? null,
      roleOnTeam: dto.roleOnTeam ?? null,
      phone: dto.phone ?? null,
      documentUrl: dto.documentUrl ?? null,
    } as never);

    return toTeamMemberDto(member);
  }

  async updateTeamMember(
    userId: string,
    memberId: string,
    dto: Partial<ArtisanTeamMemberInputDto>,
  ): Promise<ArtisanTeamMemberDto> {
    const artisan = await this.resolveArtisanByUserId(userId);
    const member = await this.findOwnedTeamMember(artisan.id, memberId);

    const updates: Partial<ArtisanTeamMember> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.roleOnTeam !== undefined) updates.roleOnTeam = dto.roleOnTeam;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.documentUrl !== undefined) updates.documentUrl = dto.documentUrl;

    await member.update(updates);
    return toTeamMemberDto(member);
  }

  async removeTeamMember(userId: string, memberId: string): Promise<void> {
    const artisan = await this.resolveArtisanByUserId(userId);
    const member = await this.findOwnedTeamMember(artisan.id, memberId);
    await member.destroy();
  }

  // Unverified artisans are not customer-visible at all (spec §5) — a 404
  // here is indistinguishable from "this artisan doesn't exist", by
  // design.
  async getPublicProfile(artisanId: string): Promise<ArtisanPublicProfileDto> {
    const artisan = await this.artisanModel.findByPk(artisanId);
    if (!artisan || !artisan.isVerified) {
      throw new NotFoundException(`artisan ${artisanId} not found`);
    }
    return toArtisanPublicProfileDto(artisan);
  }

  async listArtisans(): Promise<ArtisanProfileDto[]> {
    const artisans = await this.artisanModel.findAll({
      include: DEFAULT_INCLUDES,
      order: [['createdAt', 'DESC']],
    });
    return artisans.map((artisan) => toArtisanProfileDto(artisan));
  }

  async getArtisanById(artisanId: string): Promise<ArtisanProfileDto> {
    return toArtisanProfileDto(await this.findByIdOrThrow(artisanId));
  }

  async listPendingVerification(): Promise<ArtisanProfileDto[]> {
    // An artisan with no document yet is "incomplete", not "pending" —
    // deliberately excluded (Review Focus item from the implementation
    // plan, LLD §4.8).
    const artisans = await this.artisanModel.findAll({
      where: { isVerified: false },
      include: DEFAULT_INCLUDES,
      order: [['createdAt', 'ASC']],
    });
    return artisans
      .filter((artisan) => artisan.documentUrl !== null)
      .map((artisan) => toArtisanProfileDto(artisan));
  }

  // Document-backed check (spec §3 scope decision, §6): cannot verify an
  // artisan who never uploaded a document.
  async verify(artisanId: string): Promise<ArtisanProfileDto> {
    const artisan = await this.findByIdOrThrow(artisanId);
    if (!artisan.documentUrl) {
      throw new BadRequestException('cannot verify an artisan with no uploaded document');
    }

    await this.artisanModel.update({ isVerified: true }, { where: { id: artisanId } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisanId));
  }

  // No persisted reason column in the §4.1 schema — logged only, matching
  // AdminService.rejectUser's existing reason-is-log-only pattern.
  async rejectVerification(artisanId: string): Promise<ArtisanProfileDto> {
    await this.findByIdOrThrow(artisanId);
    await this.artisanModel.update({ isVerified: false }, { where: { id: artisanId } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisanId));
  }

  private async findByIdOrThrow(artisanId: string): Promise<Artisan> {
    const artisan = await this.artisanModel.findByPk(artisanId, { include: DEFAULT_INCLUDES });
    if (!artisan) {
      throw new NotFoundException(`artisan ${artisanId} not found`);
    }
    return artisan;
  }

  private async findOwnedTeamMember(
    artisanId: string,
    memberId: string,
  ): Promise<ArtisanTeamMember> {
    const member = await this.artisanTeamMemberModel.findOne({
      where: { id: memberId, artisanId },
    });
    if (!member) {
      throw new ForbiddenException('this team member does not belong to your profile');
    }
    return member;
  }
}
