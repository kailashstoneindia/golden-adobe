import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VendorCatalogImportService } from './vendor-catalog-import.service';
import { ResolveReviewRowLinkDto, ResolveReviewRowRejectDto } from './dto/resolve-review-row.dto';

// Admin review queue (catalog-excel-flows.md Flow 3, decision 0011 section
// 6) — needs_review catalog_import_row entries with ranked candidates, not
// a bare flag. Three outcomes: link to an existing product (teaches the
// matcher via vendor_product_map), reject as junk/duplicate, or — promoting
// raw_row_json into a brand-new draft product — deliberately NOT built
// here; that reuses Phase 3's CatalogImportUploadService creation path and
// is a natural follow-up once this queue has real data to exercise it
// against.
@ApiTags('Catalog Review Queue')
@Controller('admin/catalog-review-queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class CatalogReviewQueueController {
  constructor(private readonly importService: VendorCatalogImportService) {}

  @Get()
  @ApiOperation({ summary: 'List needs_review vendor import rows with ranked candidates' })
  async list() {
    return this.importService.listReviewQueue();
  }

  @Post(':importRowId/link')
  @ApiOperation({
    summary: 'Link a review row to an existing product',
    description: 'Writes vendor_product_map so the same vendor SKU auto-matches next time.',
  })
  async link(@Param('importRowId') importRowId: string, @Body() dto: ResolveReviewRowLinkDto) {
    return this.importService.resolveReviewRowAsLink(importRowId, dto.masterProductId);
  }

  @Post(':importRowId/reject')
  @ApiOperation({ summary: 'Reject a review row as junk or a duplicate' })
  async reject(@Param('importRowId') importRowId: string, @Body() dto: ResolveReviewRowRejectDto) {
    await this.importService.resolveReviewRowAsRejected(importRowId, dto.reason);
    return { message: 'rejected' };
  }
}
