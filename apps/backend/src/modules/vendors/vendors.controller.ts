import { Controller, Post, Patch, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { OnboardVendorDto } from './dto/onboard-vendor.dto';
import { UpdateVendorOnboardingProgressDto } from './dto/update-vendor-onboarding-progress.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@golden-abode/types';

@ApiTags('Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Post('onboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit vendor profile details' })
  @ApiResponse({ status: 201, description: 'Vendor profile created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires VENDOR role' })
  @ApiResponse({ status: 409, description: 'Vendor profile already exists' })
  async onboard(@Req() req: any, @Body() dto: OnboardVendorDto) {
    const userId = req.user.sub;
    const profile = await this.vendorsService.createProfile(userId, dto);
    return profile;
  }

  @Patch('onboarding-progress')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Persist vendor onboarding progress stage' })
  @ApiResponse({ status: 200, description: 'Onboarding stage updated' })
  async updateOnboardingProgress(
    @Req() req: any,
    @Body() dto: UpdateVendorOnboardingProgressDto,
  ) {
    const userId = req.user.sub;
    await this.vendorsService.updateOnboardingProgress(userId, dto.onboardingStage);
    return { success: true };
  }
}
