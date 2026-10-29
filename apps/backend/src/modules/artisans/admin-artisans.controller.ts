import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ArtisansService } from './artisans.service';
import { HireRequestsService } from './hire-requests.service';
import { ReviewHireRequestDto } from './dto/review-hire-request.dto';

// Admin-facing artisan administration. Mirrors AdminVendorsController's
// structure exactly: same guard stack, same ParseUUIDPipe on id params,
// same Swagger decorators.
@ApiTags('Admin Artisans')
@Controller('admin/artisans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminArtisansController {
  constructor(
    private readonly artisansService: ArtisansService,
    private readonly hireRequestsService: HireRequestsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all artisan profiles' })
  @ApiResponse({ status: 200, description: 'All artisan profiles, newest first' })
  async list() {
    return this.artisansService.listArtisans();
  }

  @Get('pending-verification')
  @ApiOperation({
    summary: 'Artisans awaiting verification',
    description:
      'isVerified = false AND a document has been uploaded. An artisan with no document yet is "incomplete", not "pending", and is excluded.',
  })
  @ApiResponse({ status: 200, description: 'Artisans ready for an admin to review' })
  async pendingVerification() {
    return this.artisansService.listPendingVerification();
  }

  @Get('hire-requests/pending')
  @ApiOperation({ summary: 'Hire requests awaiting admin review' })
  @ApiResponse({ status: 200, description: 'Requests with status PENDING_ADMIN_REVIEW' })
  async pendingHireRequests() {
    return this.hireRequestsService.listPendingAdminReview();
  }

  @Patch('hire-requests/:id/review')
  @ApiOperation({
    summary: 'Approve or reject a hire request',
    description:
      'Approving moves PENDING_ADMIN_REVIEW straight to ACCEPTED_BY_ARTISAN (the artisan is notified for the first time at this point). Rejecting is terminal — no resubmit path.',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request' })
  @ApiResponse({ status: 409, description: 'Request is not currently PENDING_ADMIN_REVIEW' })
  async reviewHireRequest(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewHireRequestDto,
  ) {
    return this.hireRequestsService.reviewRequest(req.user.sub, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one artisan profile by id' })
  @ApiResponse({ status: 200, description: 'The artisan profile' })
  @ApiResponse({ status: 404, description: 'No such artisan' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.artisansService.getArtisanById(id);
  }

  @Patch(':id/verify')
  @ApiOperation({
    summary: 'Verify an artisan',
    description: 'Requires a document to already be uploaded — 400 otherwise.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile, isVerified: true' })
  @ApiResponse({ status: 400, description: 'No uploaded document to review' })
  async verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.artisansService.verify(id);
  }

  @Patch(':id/reject-verification')
  @ApiOperation({
    summary: 'Reject (or re-close) an artisan verification',
    description:
      'Sets/keeps isVerified false. The optional reason is logged only, matching AdminService.rejectUser — this schema has no persisted-reason column.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile, isVerified: false' })
  async rejectVerification(@Param('id', ParseUUIDPipe) id: string) {
    return this.artisansService.rejectVerification(id);
  }
}
