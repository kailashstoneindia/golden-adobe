import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchService } from './search.service';
import { PostgresSearchService } from './fallback/postgres-search.service';
import { SearchRebuildService } from './indexing/rebuild.service';
import { AdminSearchQueryDto, SearchQueryDto, parseAttrPairs } from './dto/search-query.dto';

// Phase 6g (decision 0021, search-system-design.md sections 6 and 8).
//
// Customer search is PUBLIC and PROXIED — not direct-to-Meilisearch — because
// the city filter must be applied by the server rather than trusted from the
// client (0018/0019). Admin search is a separate, authenticated endpoint on a
// different path because it answers a structurally different question.
@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: "Search products available in the customer's resolved city",
    description:
      'City is resolved server-side from pincode and/or coordinates — never accepted from the client. ' +
      'Falls back to Postgres transparently if Meilisearch is unavailable; the response shape is identical either way.',
  })
  async search(@Query() dto: SearchQueryDto) {
    return this.searchService.search({
      query: dto.q,
      pincode: dto.pincode,
      latitude: dto.lat,
      longitude: dto.lng,
      categoryPath: dto.category,
      brand: dto.brand,
      attributes: parseAttrPairs(dto.attr),
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      limit: dto.limit,
      offset: dto.offset,
    });
  }
}

// Admin search is Postgres-only BY DESIGN, not as a fallback (decision 0019).
// A draft product has no vendor_listing, so it produces no search document,
// so Meilisearch structurally cannot represent it — and finding drafts is
// most of what admin search is for.
@ApiTags('Search')
@Controller('admin/search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminSearchController {
  constructor(
    private readonly postgresSearch: PostgresSearchService,
    private readonly rebuild: SearchRebuildService,
  ) {}

  @Post('rebuild')
  @ApiOperation({
    summary: 'Queue a full search index rebuild',
    description:
      "Inserts an entity_type='all' marker into search_outbox. The incremental drain ignores those rows " +
      'deliberately; the rebuild job consumes them, builds a shadow index and swaps it in atomically, so ' +
      'search stays available throughout. Needed after changing the document shape or index settings.',
  })
  async requestRebuild() {
    await this.rebuild.requestRebuild('admin requested');
    return { queued: true, pending: await this.rebuild.pendingRebuildCount() };
  }

  @Get('products')
  @ApiOperation({
    summary: 'Search the master catalog across every status, including drafts',
    description:
      'Always Postgres, never Meilisearch — a draft product has no listing and therefore no search document at all. ' +
      'Matches on name (trigram) or an exact product code.',
  })
  async searchProducts(@Query() dto: AdminSearchQueryDto) {
    const results = await this.postgresSearch.searchAdmin({
      query: dto.q,
      categoryPath: dto.category,
      brand: dto.brand,
      status: dto.status,
      limit: dto.limit,
      offset: dto.offset,
    });
    return { total: results.length, results };
  }
}
