import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VendorsService } from '../vendors/vendors.service';
import { StockService } from './stock.service';
import {
  BulkSetStockDto,
  ListVendorListingsQueryDto,
  SetListingStatusDto,
  SetStockDto,
} from './dto/vendor-stock.dto';

// Workstream 4 — the vendor's own stock screen. Until now `inventory` had
// no write path at all: the table shipped in Phase 4, and the two columns
// the upload sheet already parses (qty_available, status) were dropped on
// the floor.
//
// Guards at class level, matching VendorCatalogImportController and
// VendorsController — every route here is vendor-only, and per-method
// decoration is just the same two lines repeated with the risk that a
// later addition forgets them.
//
// Vendor identity always comes from the JWT via resolveVendorByUserId,
// never from a path or body parameter, and every service call takes that
// resolved vendor id so ownership is enforced in the service rather than
// trusted from the request.
@ApiTags('Vendor Listings')
@Controller('vendor/listings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
@ApiBearerAuth()
export class VendorListingsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly stockService: StockService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Your listings, with current stock',
    description:
      'Paginated, newest-updated first. Includes listings with no stock recorded at all (quantityAvailable is null) and listings at zero — those are the ones you are here to fix. Paint listings always report null stock and carry availability on status instead (decision 0007).',
  })
  @ApiResponse({ status: 200, description: 'A page of your listings' })
  @ApiResponse({ status: 404, description: 'No vendor profile for this user' })
  async list(@Req() req: any, @Query() query: ListVendorListingsQueryDto) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.stockService.listForVendor(vendor.id, query);
  }

  @Patch(':id/stock')
  @ApiOperation({
    summary: 'Set the stock on one listing',
    description:
      'The quantity is ABSOLUTE, not a delta — send what you have, not what changed. Fractional values are allowed (the unit is the category unit of measure). This never changes the listing status: setting 0 does not pause or mark the listing out of stock, and that combination is a legal state you may leave in place.',
  })
  @ApiResponse({ status: 200, description: 'The updated listing' })
  @ApiResponse({ status: 400, description: 'Paint listings carry no stock' })
  @ApiResponse({ status: 404, description: 'No such listing of yours' })
  async setStock(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockDto,
  ) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.stockService.setStock(vendor.id, id, dto.quantityAvailable);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Set one listing active / paused / out_of_stock',
    description:
      'Independent of stock — this never changes quantity_available. For tinted-to-order paint this is the ONLY availability control, since paint carries no inventory row.',
  })
  @ApiResponse({ status: 200, description: 'The updated listing' })
  @ApiResponse({ status: 404, description: 'No such listing of yours' })
  async setStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetListingStatusDto,
  ) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.stockService.setStatus(vendor.id, id, dto.status);
  }

  @Post('stock/bulk')
  @ApiOperation({
    summary: 'Set stock on many listings at once',
    description:
      'All-or-nothing: if any id is unknown, not yours, repeated, or a paint listing, the whole batch is rejected with a message naming the offenders and NOTHING is written. Up to 500 listings per call. Exists because a vendor with hundreds of listings will not click through them one at a time.',
  })
  @ApiResponse({ status: 201, description: 'How many listings were updated' })
  @ApiResponse({
    status: 400,
    description: 'A bad id, a repeat, or a paint listing — nothing was written',
  })
  async bulkSetStock(@Req() req: any, @Body() dto: BulkSetStockDto) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.stockService.bulkSetStock(vendor.id, dto);
  }
}
