import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ArtisansService } from './artisans.service';
import { HireRequestsService } from './hire-requests.service';
import { AdminArtisansService } from './admin-artisans.service';
import { ReviewHireRequestDto } from './dto/review-hire-request.dto';
import { RejectArtisanVerificationDto } from './dto/reject-artisan-verification.dto';
import { AdminUpdateTeamMemberDto } from './dto/admin-update-team-member.dto';
import { UpdateAccountDetailsDto } from './dto/update-account-details.dto';
import { UpdateArtisanProfileDto } from './dto/update-artisan-profile.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

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
    private readonly adminArtisansService: AdminArtisansService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all artisan profiles' })
  @ApiResponse({ status: 200, description: 'Page of artisan profiles, newest first' })
  async list(@Query() query: PaginationQueryDto) {
    return this.adminArtisansService.list(query.page ?? 1, query.limit ?? 20);
  }

  // Declared before ':id' so the UUID route doesn't swallow it.
  @Get('awaiting-document')
  @ApiOperation({
    summary: 'Ustaads who cannot be verified yet',
    description:
      'Active ustaads with no profile, or a profile with no document (decision 0058). Read-only: there is nothing to approve until a document arrives.',
  })
  @ApiResponse({ status: 200, description: 'Page of ustaads, newest sign-up first' })
  async awaitingDocument(@Query() query: PaginationQueryDto) {
    return this.artisansService.listAwaitingDocument(query.page ?? 1, query.limit ?? 20);
  }

  @Get('pending-verification')
  @ApiOperation({
    summary: 'Artisans awaiting verification',
    description:
      'isVerified = false AND a document has been uploaded. An artisan with no document yet is "incomplete", not "pending", and is excluded.',
  })
  @ApiResponse({ status: 200, description: 'Page of artisans ready for an admin to review' })
  async pendingVerification(@Query() query: PaginationQueryDto) {
    return this.adminArtisansService.listPendingVerification(query.page ?? 1, query.limit ?? 20);
  }

  @Get('hire-requests/pending')
  @ApiOperation({ summary: 'Hire requests awaiting admin review' })
  @ApiResponse({ status: 200, description: 'Page of requests with status PENDING_ADMIN_REVIEW' })
  async pendingHireRequests(@Query() query: PaginationQueryDto) {
    return this.hireRequestsService.listPendingAdminReview(query.page ?? 1, query.limit ?? 20);
  }

  @Get('hire-requests')
  @ApiOperation({
    summary: 'All hire requests, any status',
    description:
      'Tracking surface for engagements past the review queue — optionally narrowed with ?status=. Unlike hire-requests/pending, this is not limited to PENDING_ADMIN_REVIEW.',
  })
  @ApiResponse({ status: 200, description: 'Page of hire requests, newest first' })
  async allHireRequests(@Query() query: PaginationQueryDto) {
    return this.hireRequestsService.listAll(query.page ?? 1, query.limit ?? 20, query.status);
  }

  @Patch('hire-requests/:id/review')
  @ApiOperation({
    summary: 'Approve or reject a hire request',
    description:
      'Approving (allowing) moves PENDING_ADMIN_REVIEW to PENDING_ARTISAN_RESPONSE: the artisan sees it for the first time and has 48 hours to accept or decline (decision 0055). Rejecting (blocking) is terminal — no resubmit path.',
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

  @Patch(':id')
  @ApiOperation({
    summary: 'Fix an ustaad’s profile',
    description:
      'Trade, experience, bio, service pincode and availability (decision 0058 Task 11). Same rules as the ustaad’s own edit; never changes verification. A null is refused.',
  })
  @ApiResponse({ status: 200, description: 'The updated ustaad, admin view' })
  @ApiResponse({ status: 404, description: 'No such ustaad' })
  async updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArtisanProfileDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminArtisansService.updateProfile(id, adminUserId, dto);
  }

  @Put(':id/account-details')
  @ApiOperation({
    summary: 'Replace an ustaad’s bank account details',
    description: 'All five fields every time; creates the record if there is none.',
  })
  @ApiResponse({ status: 200, description: 'The updated ustaad, admin view' })
  @ApiResponse({ status: 404, description: 'No such ustaad' })
  async updateAccountDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDetailsDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminArtisansService.updateAccountDetails(id, adminUserId, dto);
  }

  @Patch(':id/team/:memberId')
  @ApiOperation({
    summary: 'Correct a team member’s name, role or phone',
    description: 'The member’s document cannot be changed here.',
  })
  @ApiResponse({ status: 200, description: 'The ustaad, admin view' })
  @ApiResponse({ status: 404, description: 'No such member under this ustaad' })
  async updateTeamMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: AdminUpdateTeamMemberDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminArtisansService.updateTeamMember(id, memberId, adminUserId, dto);
  }

  @Delete(':id/team/:memberId')
  @ApiOperation({ summary: 'Remove a team member from an ustaad' })
  @ApiResponse({ status: 200, description: 'The ustaad, admin view' })
  @ApiResponse({ status: 404, description: 'No such member under this ustaad' })
  async removeTeamMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminArtisansService.removeTeamMember(id, memberId, adminUserId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read one artisan profile by id' })
  @ApiResponse({ status: 200, description: 'The artisan profile' })
  @ApiResponse({ status: 404, description: 'No such artisan' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminArtisansService.get(id);
  }

  @Patch(':id/verify')
  @ApiOperation({
    summary: 'Verify an artisan',
    description: 'Requires a document to already be uploaded — 400 otherwise.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile, isVerified: true' })
  @ApiResponse({ status: 400, description: 'No uploaded document to review' })
  async verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') adminUserId: string) {
    return this.artisansService.verify(id, adminUserId);
  }

  @Patch(':id/reject-verification')
  @ApiOperation({
    summary: 'Reject (or re-close) an artisan verification',
    description:
      'Sets/keeps isVerified false. The optional reason is logged only, matching AdminService.rejectUser — this schema has no persisted-reason column.',
  })
  @ApiResponse({ status: 200, description: 'Updated profile, isVerified: false' })
  async rejectVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectArtisanVerificationDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.artisansService.rejectVerification(id, adminUserId, dto.reason);
  }
}
