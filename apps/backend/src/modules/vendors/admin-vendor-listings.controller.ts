import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SetAdminListingStatusDto } from './dto/set-admin-listing-status.dto';
import { AdminVendorsService } from './admin-vendors.service';

@ApiTags('Admin Vendors')
@Controller('admin/vendor-listings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminVendorListingsController {
  constructor(private readonly adminVendorsService: AdminVendorsService) {}

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause or reactivate one vendor listing',
    description:
      'Never changes stock. 409 when the listing is still waiting for the vendor to confirm its product match.',
  })
  @ApiResponse({ status: 200, description: 'The updated listing' })
  @ApiResponse({ status: 404, description: 'No such listing' })
  @ApiResponse({ status: 409, description: 'Awaiting the vendor’s match confirmation' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAdminListingStatusDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminVendorsService.setListingStatus(id, adminUserId, dto.status);
  }
}
