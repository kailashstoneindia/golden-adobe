import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  AdminArtisanDto,
  ArtisanHireRequestStatus,
  DocumentLinksState,
  PaginatedAdminArtisansResponse,
} from '@golden-abode/types';

import {
  ADMIN_CONTACT_ATTRIBUTES,
  toAdminContactDto,
} from '../../common/mappers/admin-contact.mapper';
import type { StorageConfig } from '../../config/storage.config';
import {
  MEDIA_STORAGE_CONFIG,
  OBJECT_STORAGE,
  ObjectStorage,
} from '../catalog/media/object-storage';
import { User } from '../users/models/user.model';
import { toArtisanProfileDto } from './artisan-profile.mapper';
import { DOCUMENT_PRESIGN_TTL_SECONDS, PENDING_VERIFICATION_WHERE } from './artisans.service';
import { Artisan } from './models/artisan.model';
import { ArtisanAccountDetails } from './models/artisan-account-details.model';
import { ArtisanTeamMember } from './models/artisan-team-member.model';

// The ustaad's current load: sent to them and waiting, accepted, or in work.
const ACTIVE_JOB_STATUSES: ArtisanHireRequestStatus[] = [
  'PENDING_ARTISAN_RESPONSE',
  'ACCEPTED_BY_ARTISAN',
  'IN_PROGRESS',
];

type DocumentLink = { url: string | null; missing: boolean };

// The admin's view of ustaads (decision 0058 Task 6). Lists carry the owner
// and job counts; only the single-ustaad detail signs document links, so a
// list never mints dozens of links nobody opens.
@Injectable()
export class AdminArtisansService {
  private readonly logger = new Logger(AdminArtisansService.name);

  constructor(
    @InjectModel(Artisan) private readonly artisanModel: typeof Artisan,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MEDIA_STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
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

    // Asked of the config, not inferred from errors: with no bucket there is
    // nothing to sign, and older plain-URL documents still open.
    if (!this.storageConfig.enabled) {
      return this.withPlainUrlsOnly(dto, 'storage_not_configured');
    }
    try {
      const own = await this.link(dto.documentUrl);
      const team = await Promise.all(dto.team.map((member) => this.link(member.documentUrl)));
      return {
        ...dto,
        documentViewUrl: own.url,
        documentMissing: own.missing,
        documentLinks: 'ok',
        team: dto.team.map((member, index) => ({
          ...member,
          documentViewUrl: team[index].url,
          documentMissing: team[index].missing,
        })),
      };
    } catch (error) {
      // Storage is configured, so this is a real fault (e.g. credentials):
      // show the ustaad anyway, but log it as an error with its stack.
      this.logger.error(
        `could not sign document links for artisan ${artisanId}`,
        (error as Error).stack,
      );
      return this.withPlainUrlsOnly(dto, 'signing_failed');
    }
  }

  private withPlainUrlsOnly(dto: AdminArtisanDto, state: DocumentLinksState): AdminArtisanDto {
    const plainUrl = (stored: string | null) => (stored && isUrl(stored) ? stored : null);
    return {
      ...dto,
      documentLinks: state,
      documentViewUrl: plainUrl(dto.documentUrl),
      team: dto.team.map((member) => ({
        ...member,
        documentViewUrl: plainUrl(member.documentUrl),
      })),
    };
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
      order: [
        ['createdAt', order],
        ['id', 'ASC'],
      ],
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
      const total = mine.reduce((n, row) => n + Number(row.n), 0);
      const active = sum(ACTIVE_JOB_STATUSES);
      const completed = sum(['COMPLETED']);
      const declined = sum(['ARTISAN_DECLINED']);
      const expired = sum(['EXPIRED']);
      const profile = toArtisanProfileDto(artisan);
      return {
        ...profile,
        owner: toAdminContactDto(artisan.user),
        documentViewUrl: null,
        documentMissing: false,
        documentLinks: 'ok' as const,
        team: profile.team.map((member) => ({
          ...member,
          documentViewUrl: null,
          documentMissing: false,
        })),
        jobCounts: {
          active,
          completed,
          declined,
          expired,
          other: total - active - completed - declined - expired,
          total,
        },
      };
    });
  }

  // Stored value is an object key (current uploads) or, for older records,
  // already a full URL. A key is checked first, so a failed upload reads as
  // "file missing" rather than an S3 error page.
  private async link(stored: string | null): Promise<DocumentLink> {
    if (!stored) return { url: null, missing: false };
    if (isUrl(stored)) return { url: stored, missing: false };
    if (!(await this.storage.head(stored))) return { url: null, missing: true };
    return {
      url: await this.storage.presignGet(stored, DOCUMENT_PRESIGN_TTL_SECONDS),
      missing: false,
    };
  }
}

function isUrl(stored: string): boolean {
  return /^https?:\/\//i.test(stored);
}
