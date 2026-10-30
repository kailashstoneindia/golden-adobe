import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import {
  ArtisanAccountDetailsDto,
  ArtisanAccountDetailsInputDto,
  ArtisanProfileDto,
  ArtisanPublicProfileDto,
  ArtisanTeamMemberDto,
  ArtisanTeamMemberInputDto,
  PaginatedArtisansResponse,
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
import { OBJECT_STORAGE, ObjectStorage, PresignedPost } from '../catalog/media/object-storage';

const DEFAULT_INCLUDES = [ArtisanAccountDetails, ArtisanTeamMember];

// Mirrors the storage.config.ts defaults MediaService uses for product
// media presigns — this module has no document-specific config of its
// own, and inventing one is not worth it for a single upload shape.
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_PRESIGN_TTL_SECONDS = 300;
const ALLOWED_DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// The single definition of "pending verification" (isVerified = false AND
// a document has been uploaded — an artisan with no document yet is
// "incomplete", not "pending"). Shared with AdminService's dashboard
// count so the two can never drift apart.
export const PENDING_VERIFICATION_WHERE: WhereOptions<Artisan> = {
  isVerified: false,
  documentUrl: { [Op.ne]: null },
};

@Injectable()
export class ArtisansService {
  private readonly logger = new Logger(ArtisansService.name);

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
  // an arbitrary S3 key as if it were their own document. The object
  // itself must also actually exist in storage — matching
  // MediaService's confirm-upload path — otherwise a caller could confirm
  // a key that was never uploaded (or a failed/aborted upload) and have
  // an admin later verify() them on the strength of a documentUrl that
  // points at nothing.
  async confirmDocumentUpload(userId: string, key: string): Promise<ArtisanProfileDto> {
    const artisan = await this.resolveArtisanByUserId(userId);

    if (!key.startsWith(`artisans/${artisan.id}/`)) {
      throw new BadRequestException("key does not belong to this artisan's own upload");
    }

    const head = await this.storage.head(key);
    if (!head) {
      throw new BadRequestException('no uploaded object found for this key');
    }

    await this.artisanModel.update({ documentUrl: key }, { where: { id: artisan.id } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisan.id));
  }

  async addTeamMember(
    userId: string,
    dto: ArtisanTeamMemberInputDto,
  ): Promise<ArtisanTeamMemberDto> {
    const artisan = await this.resolveArtisanByUserId(userId);
    if (dto.documentUrl !== undefined) {
      this.assertOwnedDocumentKey(artisan.id, dto.documentUrl);
    }

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
    if (dto.documentUrl !== undefined) {
      this.assertOwnedDocumentKey(artisan.id, dto.documentUrl);
    }

    const updates: Partial<ArtisanTeamMember> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.roleOnTeam !== undefined) updates.roleOnTeam = dto.roleOnTeam;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.documentUrl !== undefined) updates.documentUrl = dto.documentUrl;

    await member.update(updates);
    return toTeamMemberDto(member);
  }

  // Same ownership-prefix rule as confirmDocumentUpload, without the
  // storage.head() existence check — team-member documents have no
  // presign/confirm upload flow of their own (spec §8.3: optional,
  // free-form, "mirroring the lead's own document_url pattern"), so
  // there is nothing to confirm against. This only stops a caller from
  // pointing a team member's documentUrl at a key outside their own
  // artisan prefix (e.g. another artisan's uploaded document).
  private assertOwnedDocumentKey(artisanId: string, key: string): void {
    if (!key.startsWith(`artisans/${artisanId}/`)) {
      throw new BadRequestException("key does not belong to this artisan's own upload");
    }
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

  async listArtisans(page: number, limit: number): Promise<PaginatedArtisansResponse> {
    const offset = (page - 1) * limit;
    const { rows, count } = await this.artisanModel.findAndCountAll({
      include: DEFAULT_INCLUDES,
      distinct: true,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });
    return {
      items: rows.map((artisan) => toArtisanProfileDto(artisan)),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  async getArtisanById(artisanId: string): Promise<ArtisanProfileDto> {
    return toArtisanProfileDto(await this.findByIdOrThrow(artisanId));
  }

  async listPendingVerification(page: number, limit: number): Promise<PaginatedArtisansResponse> {
    // Review Focus item from the implementation plan, LLD §4.8: an
    // artisan with no document yet is "incomplete", not "pending" —
    // excluded by PENDING_VERIFICATION_WHERE itself, in SQL, not here.
    const offset = (page - 1) * limit;
    const { rows, count } = await this.artisanModel.findAndCountAll({
      where: PENDING_VERIFICATION_WHERE,
      include: DEFAULT_INCLUDES,
      distinct: true,
      limit,
      offset,
      order: [['createdAt', 'ASC']],
    });
    return {
      items: rows.map((artisan) => toArtisanProfileDto(artisan)),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  // Document-backed check (spec §3 scope decision, §6): cannot verify an
  // artisan who never uploaded a document. Unlike HireRequestsService's
  // conditional-UPDATE review gate, isVerified has no terminal state and
  // no side effect that must fire exactly once — it's a freely
  // re-toggleable flag an admin can flip back and forth, so a plain
  // unconditional update (last write wins) is the correct, simpler
  // choice here, not a gap to close with the same guard.
  async verify(artisanId: string): Promise<ArtisanProfileDto> {
    const artisan = await this.findByIdOrThrow(artisanId);
    if (!artisan.documentUrl) {
      throw new BadRequestException('cannot verify an artisan with no uploaded document');
    }

    await this.artisanModel.update({ isVerified: true }, { where: { id: artisanId } });
    return toArtisanProfileDto(await this.findByIdOrThrow(artisanId));
  }

  // No persisted reason column in the §4.1 schema — logged only, matching
  // AdminService.rejectUser's existing reason-is-log-only pattern. Same
  // last-write-wins reasoning as verify() above applies here too.
  async rejectVerification(artisanId: string, reason?: string): Promise<ArtisanProfileDto> {
    await this.findByIdOrThrow(artisanId);
    await this.artisanModel.update({ isVerified: false }, { where: { id: artisanId } });
    this.logger.log(`Rejected verification for artisan ${artisanId}${reason ? `: ${reason}` : ''}`);
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
