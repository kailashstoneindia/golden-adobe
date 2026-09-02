import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VendorsService } from './vendors.service';
import { VendorCategoriesService } from '../catalog/vendor-categories.service';
import { SetVendorCategoriesDto } from '../catalog/dto/set-vendor-categories.dto';
import { SetVendorCityDto } from './dto/set-vendor-city.dto';

// Admin-facing vendor administration. Vendor data was previously reachable
// only nested inside GET /admin/users/:id, which meant no way to list
// vendors as vendors, and no way to correct a vendor's city or
// registration scope at all.
//
// Registration scope is admin-writable and vendor-read-only on purpose: a
// vendor who could edit their own categories could widen their export
// scope at will, which reduces the control decision 0011 describes to a
// formality.
@ApiTags('Admin Vendors')
@Controller('admin/vendors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminVendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly vendorCategoriesService: VendorCategoriesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all vendor profiles',
    description: 'Includes account details and resolved city for each vendor.',
  })
  @ApiResponse({ status: 200, description: 'All vendor profiles, newest first' })
  async list() {
    return this.vendorsService.listVendors();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one vendor profile by vendor id' })
  @ApiResponse({ status: 200, description: 'The vendor profile' })
  @ApiResponse({ status: 404, description: 'No such vendor' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getVendorById(id);
  }

  @Patch(':id/city')
  @ApiOperation({
    summary: 'Override a vendor city',
    description:
      'Pins the vendor to a city (decision 0019). The pin is sticky — a vendor editing their address will no longer re-resolve it. Send cityId: null to clear the pin and let the next address change resolve from GPS again. Rejects inactive cities, which would hide the vendor from search.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 404, description: 'No such vendor, or no such city' })
  @ApiResponse({ status: 409, description: 'City is not active' })
  async setCity(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetVendorCityDto) {
    return this.vendorsService.setVendorCity(id, dto.cityId);
  }

  @Get(':id/categories')
  @ApiOperation({ summary: 'The categories a vendor is registered for' })
  @ApiResponse({ status: 200, description: 'Registered leaf categories' })
  async getCategories(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorCategoriesService.listForVendor(id);
  }

  @Put(':id/categories')
  @ApiOperation({
    summary: 'Replace the categories a vendor is registered for',
    description:
      'Full replace, not a delta — the body is the complete set. Ids must be real LEAF categories, since products only attach to leaves. An empty array unregisters the vendor entirely, which under the current fallback makes their export scope unrestricted rather than empty.',
  })
  @ApiResponse({ status: 200, description: 'The vendor registered categories after replacement' })
  @ApiResponse({ status: 400, description: 'Unknown or non-leaf category ids' })
  @ApiResponse({ status: 404, description: 'No such vendor' })
  async setCategories(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetVendorCategoriesDto,
  ) {
    return this.vendorCategoriesService.replaceForVendor(id, dto.categoryIds);
  }
}
