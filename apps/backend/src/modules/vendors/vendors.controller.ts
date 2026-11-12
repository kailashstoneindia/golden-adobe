import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  ParseUUIDPipe,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VendorsService } from './vendors.service';
import { VendorCategoriesService } from '../catalog/vendor-categories.service';
import { OrdersService } from '../orders/orders.service';
import { OrderVendorGroupStatus } from '../orders/models/order-vendor-group.model';
import { VendorHandoverService } from '../delivery/vendor-handover.service';
import { HandoverDto, HandoverPhotoUrlDto } from '../delivery/dto/vendor-handover.dto';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { UpdateAccountDetailsDto } from './dto/update-account-details.dto';
import { UpdateVendorOnboardingProgressDto } from './dto/update-vendor-onboarding-progress.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApprovedGuard } from '../../common/guards/approved.guard';
import { AllowUnapproved } from '../../common/decorators/allow-unapproved.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@golden-abode/types';

class UpdateOrderGroupStatusDto {
  @IsEnum(OrderVendorGroupStatus)
  status: OrderVendorGroupStatus;
}

// Guards at class level — the newer convention in this codebase (see
// VendorCatalogImportController). Every route here is vendor-only, so
// per-method decoration would just be five copies of the same two lines
// with the risk that a sixth route added later forgets them.
@ApiTags('Vendors')
@Controller('vendors')
// Decision 0059: vendors and ustaads need an approved account here unless a
// route is marked @AllowUnapproved() (onboarding and own profile).
@UseGuards(JwtAuthGuard, RolesGuard, ApprovedGuard)
@Roles(Role.VENDOR)
@ApiBearerAuth()
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly vendorCategoriesService: VendorCategoriesService,
    private readonly ordersService: OrdersService,
    private readonly handovers: VendorHandoverService,
  ) {}

  @AllowUnapproved()
  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit vendor profile details',
    description:
      'Creates the vendor and its account-details row in one transaction, and auto-resolves city_id from the supplied latitude/longitude (decision 0019). A vendor whose coordinates match no active city is still created, with a null city — they stay invisible to city-scoped search until an admin sets one.',
  })
  @ApiResponse({ status: 201, description: 'Vendor profile created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires VENDOR role' })
  @ApiResponse({ status: 409, description: 'Vendor profile already exists' })
  async onboard(@Req() req: any, @Body() dto: OnboardVendorDto) {
    const userId = req.user.sub;
    const profile = await this.vendorsService.createProfile(userId, dto);
    return profile;
  }

  @AllowUnapproved()
  @Get('me')
  @ApiOperation({
    summary: 'Read your own vendor profile',
    description: 'Includes structured account details and the resolved city.',
  })
  @ApiResponse({ status: 200, description: 'The calling vendor profile' })
  @ApiResponse({ status: 404, description: 'No vendor profile for this user' })
  async getMe(@Req() req: any) {
    return this.vendorsService.getProfileByUserId(req.user.sub);
  }

  @AllowUnapproved()
  @Patch('me')
  @ApiOperation({
    summary: 'Update your own vendor profile',
    description:
      'Partial update. Sending latitude/longitude (which must be sent together) re-resolves city_id — unless an admin has pinned the city, in which case the pin wins and the coordinates update alone.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 404, description: 'No vendor profile for this user' })
  async updateMe(@Req() req: any, @Body() dto: UpdateVendorProfileDto) {
    return this.vendorsService.updateProfile(req.user.sub, dto);
  }

  @AllowUnapproved()
  @Patch('me/account-details')
  @ApiOperation({
    summary: 'Update your bank account details',
    description:
      'Update-or-create — vendor_account_details holds exactly one row per vendor. All fields are required; this is not a partial patch, because a half-updated bank record is a failed payout.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile including new account details' })
  async updateAccountDetails(@Req() req: any, @Body() dto: UpdateAccountDetailsDto) {
    return this.vendorsService.updateAccountDetails(req.user.sub, dto);
  }

  @AllowUnapproved()
  @Get('me/categories')
  @ApiOperation({
    summary: 'The categories your shop is registered for',
    description:
      'These bound what you may request in a catalog export. Read-only for vendors — registration scope is an admin decision (see PUT /admin/vendors/:id/categories). An empty list currently means unrestricted export scope, not "nothing permitted".',
  })
  @ApiResponse({ status: 200, description: 'Registered leaf categories' })
  async getMyCategories(@Req() req: any) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.vendorCategoriesService.listForVendor(vendor.id);
  }

  @AllowUnapproved()
  @Patch('onboarding-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Persist vendor onboarding progress stage' })
  @ApiResponse({ status: 200, description: 'Onboarding stage updated' })
  async updateOnboardingProgress(@Req() req: any, @Body() dto: UpdateVendorOnboardingProgressDto) {
    const userId = req.user.sub;
    await this.vendorsService.updateOnboardingProgress(userId, dto.onboardingStage);
    return { success: true };
  }

  @Get('order-groups')
  @ApiOperation({
    summary: 'Orders assigned to you',
    description:
      'The reliable source of truth for "do I have an order" — independent of whether a push notification arrived. Each group is one vendor\'s slice of a (possibly multi-vendor) customer order: your items and subtotal only, never the other vendor(s) sharing the same cart/payment or the order\'s grand total.',
  })
  @ApiResponse({ status: 200, description: 'Your order groups, newest first' })
  async listOrderGroups(@Req() req: any) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.ordersService.listForVendor(vendor.id);
  }

  @Get('order-groups/:id')
  @ApiResponse({ status: 200, description: 'One order group' })
  @ApiResponse({ status: 404, description: 'Not found, or belongs to another vendor' })
  async getOrderGroup(@Req() req: any, @Param('id') id: string) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.ordersService.getForVendor(vendor.id, id);
  }

  @Patch('order-groups/:id/status')
  @ApiOperation({
    summary: 'Advance your fulfilment status for this order group',
    description:
      'Forward-only: pending -> confirmed -> shipped -> delivered, or cancel from pending/confirmed.',
  })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 400, description: 'Invalid transition from the current status' })
  async updateOrderGroupStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderGroupStatusDto,
  ) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.ordersService.updateVendorGroupStatus(vendor.id, id, dto.status);
  }

  @Post('order-groups/:id/photo-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Presigned upload for the optional handover photo (decision 0060)' })
  @ApiResponse({ status: 404, description: 'Not found, or belongs to another vendor' })
  async handoverPhotoUrl(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoverPhotoUrlDto,
  ) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.handovers.createPhotoUrl(vendor.id, id, dto.contentType);
  }

  @Post('order-groups/:id/handover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the goods were handed to the assigned driver',
    description:
      'Needs a driver assigned (400 otherwise). Idempotent: a repeat call keeps the first timestamp. The group status does not change; the driver confirms pickup.',
  })
  @ApiResponse({ status: 404, description: 'Not found, or belongs to another vendor' })
  async handover(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoverDto,
  ) {
    const vendor = await this.vendorsService.resolveVendorByUserId(req.user.sub);
    return this.handovers.markHandedOver(vendor.id, id, dto.photoKey);
  }
}
