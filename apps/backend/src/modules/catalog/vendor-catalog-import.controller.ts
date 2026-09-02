import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/sequelize';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Vendor } from '../vendors/models/vendor.model';
import { VendorCatalogExportService } from './vendor-catalog-export.service';
import { VendorCatalogImportService } from './vendor-catalog-import.service';
import { VendorCategoriesService } from './vendor-categories.service';
import { VendorExportScopeDto } from './dto/vendor-export-scope.dto';
import { ChoosePendingCandidateDto } from './dto/choose-pending-candidate.dto';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

// Flow 2 — vendor inventory upload (catalog-excel-flows.md, decision 0011).
// Vendor-facing: export (download the pre-filled sheet), upload (submit
// the filled sheet), and confirm/reject for matches that came back paused
// pending the vendor's own sign-off ("vendor confirms the first match
// only", 0011 section 5).
@ApiTags('Vendor Catalog Import')
@Controller('vendor/catalog-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@ApiBearerAuth()
export class VendorCatalogImportController {
  constructor(
    @InjectModel(Vendor)
    private readonly vendorModel: typeof Vendor,
    private readonly exportService: VendorCatalogExportService,
    private readonly importService: VendorCatalogImportService,
    private readonly vendorCategoriesService: VendorCategoriesService,
  ) {}

  @Get('export/count')
  @ApiOperation({
    summary: 'Live row count for a proposed export scope',
    description:
      'Call before downloading — the guard against an unusable export (decision 0011). A Hardware vendor scoped only to their registered categories can easily hit thousands of rows; narrowing by brand or since-date is expected. Rejects with 400 if the scope names a category your shop is not registered for. NOTE: a vendor with no registered categories at all is currently unrestricted rather than denied, until vendor_category is backfilled.',
  })
  async exportCount(@Req() req: any, @Query() scope: VendorExportScopeDto) {
    // Enforced on the count route too, not just the download: otherwise
    // it becomes an oracle telling any authenticated vendor how many
    // products sit in categories they may not export, and the two routes
    // would disagree about what counts as a valid scope.
    const vendor = await this.resolveVendor(req);
    await this.vendorCategoriesService.assertExportScopeAllowed(vendor.id, scope.leafCategoryIds);

    const count = await this.exportService.countRows({
      leafCategoryIds: scope.leafCategoryIds,
      brandIds: scope.brandIds,
      sinceDate: scope.sinceDate ? new Date(scope.sinceDate) : undefined,
    });
    return { rowCount: count };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Download the pre-filled catalog export for the given scope',
    description:
      'product_code and product_name are locked/pre-filled; price, qty and grade are blank for the vendor to fill. Scoped to the categories your shop is registered for — requesting others is rejected with 400 naming them, rather than silently narrowed. A vendor with no registered categories is currently unrestricted (see the count endpoint).',
  })
  async exportFile(@Req() req: any, @Query() scope: VendorExportScopeDto, @Res() res: Response) {
    const vendor = await this.resolveVendor(req);
    await this.vendorCategoriesService.assertExportScopeAllowed(vendor.id, scope.leafCategoryIds);

    const { buffer, filename, rowCount } = await this.exportService.generate({
      leafCategoryIds: scope.leafCategoryIds,
      brandIds: scope.brandIds,
      sinceDate: scope.sinceDate ? new Date(scope.sinceDate) : undefined,
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Row-Count': String(rowCount),
    });
    res.send(buffer);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a completed inventory sheet',
    description:
      'Each row runs the match ladder. Deterministic matches (own SKU, product_code, brand+MPN, GTIN, stone variety alias) go live immediately. Structured matches go live PAUSED, pending confirmation via /confirm. No match becomes a review-queue item (new product request).',
  })
  async upload(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    const vendor = await this.resolveVendor(req);
    if (!file) {
      throw new BadRequestException('file is required (multipart field name: "file")');
    }
    if (!XLSX_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`expected an .xlsx file, got mimetype "${file.mimetype}"`);
    }
    return this.importService.importFile(vendor.id, file.buffer);
  }

  @Get('pending-confirmations')
  @ApiOperation({
    summary: 'Listings created from an uncertain match, awaiting your confirmation',
  })
  async pendingConfirmations(@Req() req: any) {
    const vendor = await this.resolveVendor(req);
    return this.importService.listPendingConfirmations(vendor.id);
  }

  @Post('pending-confirmations/:vendorListingId/confirm')
  @ApiOperation({ summary: 'Confirm a paused listing is correct — activates it' })
  async confirm(@Req() req: any, @Param('vendorListingId') vendorListingId: string) {
    const vendor = await this.resolveVendor(req);
    return this.importService.confirmPendingListing(vendor.id, vendorListingId);
  }

  @Post('pending-confirmations/:vendorListingId/choose')
  @ApiOperation({
    summary: 'Pick a different product from the alternatives shown, correcting the match',
    description:
      'Phase 7 risk 2 — lets a vendor correct a match to one of the alternatives the matcher scored close behind the original, instead of only confirm/reject on the single proposed product.',
  })
  async choose(
    @Req() req: any,
    @Param('vendorListingId') vendorListingId: string,
    @Body() dto: ChoosePendingCandidateDto,
  ) {
    const vendor = await this.resolveVendor(req);
    return this.importService.choosePendingListingCandidate(
      vendor.id,
      vendorListingId,
      dto.masterProductId,
    );
  }

  @Post('pending-confirmations/:vendorListingId/reject')
  @ApiOperation({ summary: 'Reject a paused listing as an incorrect match — removes it' })
  async reject(@Req() req: any, @Param('vendorListingId') vendorListingId: string) {
    const vendor = await this.resolveVendor(req);
    await this.importService.rejectPendingListing(vendor.id, vendorListingId);
    return { message: 'listing removed' };
  }

  private async resolveVendor(req: any): Promise<Vendor> {
    const vendor = await this.vendorModel.findOne({ where: { userId: req.user.sub } });
    if (!vendor) {
      throw new NotFoundException('no vendor profile found for this user');
    }
    return vendor;
  }
}
