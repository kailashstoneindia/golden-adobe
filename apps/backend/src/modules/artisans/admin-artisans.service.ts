import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AdminArtisanDto, PaginatedAdminArtisansResponse } from '@golden-abode/types';

import {
  ADMIN_CONTACT_ATTRIBUTES,
  toAdminContactDto,
} from '../../common/mappers/admin-contact.mapper';
import { OBJECT_STORAGE, ObjectStorage } from '../catalog/media/object-storage';
import { User } from '../users/models/user.model';
import { toArtisanProfileDto } from './artisan-profile.mapper';
import { PENDING_VERIFICATION_WHERE } from './artisans.service';
import { Artisan } from './models/artisan.model';
import { ArtisanAccountDetails } from './models/artisan-account-details.model';
import { ArtisanTeamMember } from './models/artisan-team-member.model';

// Same lifetime as the upload links (artisans.service.ts): long enough to open
// the file, short enough that a copied link soon stops working.
export const DOCUMENT_VIEW_TTL_SECONDS = 300;

// Hire requests that are the ustaad's current load: sent to them and waiting,
// accepted, or being worked.
const ACTIVE_JOB_STATUSES = ['PENDING_ARTISAN_RESPONSE', 'ACCEPTED_BY_ARTISAN', 'IN_PROGRESS'];

// The admin's view of ustaads (decision 0058 Task 6). Lists carry the owner
// and job counts; only the single-ustaad detail signs document links, so a
// list never mints dozens of links nobody opens.
@Injectable()
export class AdminArtisansService {
  private readonly logger = new Logger(AdminArtisansService.name);

  constructor(
    @InjectModel(Artisan) private readonly artisanModel: typeof Artisan,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly sequelize: Sequelize,
  ) {}

  list(page: number, limit: number): Promise<PaginatedAdminArtisansResponse> {
    return this.page({}, 'DESC', page, limit);
  }

  // isVerified = false with a document: the verification queue, oldest first.
  listPendingVerification(page: number, limit: number): Promise<PaginatedAdminArtisansResponse> {
    return this.page(PENDING_VERIFICATION_WHERE, 'ASC', page, limit);
  }

  async get(artisanId: string): Promise<AdminArtisanDto> {
    const artisan = await this.artisanModel.findByPk(artisanId, { include: this.includes() });
    if (!artisan) {
      throw new NotFoundException(`artisan ${artisanId} not found`);
    }
    const [dto] = await this.withFacts([artisan]);
    try {
      return {
        ...dto,
        documentViewUrl: await this.viewUrl(dto.documentUrl),
        team: await Promise.all(
          dto.team.map(async (member) => ({
            ...member,
            documentViewUrl: await this.viewUrl(member.documentUrl),
          })),
        ),
      };
    } catch (error) {
      // No bucket configured (or S3 unreachable): the rest of the ustaad is
      // still worth showing. The admin sees that links are unavailable.
      this.logger.warn(
        `could not sign document links for artisan ${artisanId}: ${(error as Error).message}`,
      );
      // Older documents stored as full URLs need no signing and still open.
      const plainUrl = (stored: string | null) => (stored && isUrl(stored) ? stored : null);
      return {
        ...dto,
        documentStorageAvailable: false,
        documentViewUrl: plainUrl(dto.documentUrl),
        team: dto.team.map((member) => ({
          ...member,
          documentViewUrl: plainUrl(member.documentUrl),
        })),
      };
    }
  }

  private async page(
    where: WhereOptions<Artisan>,
    order: 'ASC' | 'DESC',
    page: number,
    limit: number,
  ): Promise<PaginatedAdminArtisansResponse> {
    const { rows, count } = await this.artisanModel.findAndCountAll({
      where,
      include: this.includes(),
      distinct: true,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', order]],
    });
    return {
      items: await this.withFacts(rows),
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  private includes() {
    // A new User include per call: Sequelize writes into include objects.
    return [
      ArtisanAccountDetails,
      ArtisanTeamMember,
      { model: User, attributes: [...ADMIN_CONTACT_ATTRIBUTES] },
    ];
  }

  private async withFacts(artisans: Artisan[]): Promise<AdminArtisanDto[]> {
    if (artisans.length === 0) return [];
    const counts = await this.sequelize.query<{ artisan_id: string; status: string; n: string }>(
      `SELECT artisan_id, status::text AS status, count(*) AS n FROM artisan_hire_requests
        WHERE artisan_id IN (:artisanIds) GROUP BY artisan_id, status`,
      { replacements: { artisanIds: artisans.map((a) => a.id) }, type: QueryTypes.SELECT },
    );
    return artisans.map((artisan) => {
      const mine = counts.filter((row) => row.artisan_id === artisan.id);
      const sum = (statuses: string[]) =>
        mine
          .filter((row) => statuses.includes(row.status))
          .reduce((n, row) => n + Number(row.n), 0);
      const profile = toArtisanProfileDto(artisan);
      return {
        ...profile,
        owner: toAdminContactDto(artisan.user),
        documentViewUrl: null,
        documentStorageAvailable: true,
        team: profile.team.map((member) => ({ ...member, documentViewUrl: null })),
        jobCounts: {
          active: sum(ACTIVE_JOB_STATUSES),
          completed: sum(['COMPLETED']),
          declined: sum(['ARTISAN_DECLINED']),
          total: mine.reduce((n, row) => n + Number(row.n), 0),
        },
      };
    });
  }

  // Stored value is an object key (current uploads) or, for older records,
  // already a full URL.
  private async viewUrl(stored: string | null): Promise<string | null> {
    if (!stored) return null;
    if (/^https?:\/\//i.test(stored)) return stored;
    return this.storage.presignGet(stored, DOCUMENT_VIEW_TTL_SECONDS);
  }
}

function isUrl(stored: string): boolean {
  return /^https?:\/\//i.test(stored);
}
