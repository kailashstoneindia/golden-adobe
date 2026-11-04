import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { ArtisansService } from './artisans.service';
import { HireRequestsService } from './hire-requests.service';
import { isVisibleToArtisan } from './hire-request-rules';
import { OnboardArtisanDto } from './dto/onboard-artisan.dto';
import { UpdateArtisanProfileDto } from './dto/update-artisan-profile.dto';
import { UpdateAccountDetailsDto } from './dto/update-account-details.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CreateHireRequestDto } from './dto/create-hire-request.dto';
import { CancelHireRequestDto } from './dto/cancel-hire-request.dto';
import { DeclineHireRequestDto } from './dto/decline-hire-request.dto';
import { CreateCompletionEstimateDto } from './dto/create-completion-estimate.dto';
import { CreateDocumentUploadUrlDto } from './dto/create-document-upload-url.dto';
import { ConfirmDocumentUploadDto } from './dto/confirm-document-upload.dto';
import { SearchArtisansQueryDto } from './dto/search-artisans-query.dto';

// No controller-level @Roles(): routes here are split across ARTISAN,
// CUSTOMER, and "any authenticated role" (the public profile and shared
// estimate-history reads), so each gets its own method-level @Roles() —
// RolesGuard's getAllAndOverride means a method's own decorator wins over
// a class-level one, so there is nothing to override here, only nothing
// to set.
@ApiTags('Artisans')
@Controller('artisans')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ArtisansController {
  constructor(
    private readonly artisansService: ArtisansService,
    private readonly hireRequestsService: HireRequestsService,
  ) {}

  // Customer-facing browse/search (decision 0051 Batch B). Any
  // authenticated role, like :id/public — verified artisans are meant to
  // be discoverable, not customer-only. Bare 'artisans' as a path has no
  // collision risk against the dynamic :id routes below (a static
  // segment always wins over a dynamic one at the same position,
  // regardless of registration order — unlike the :id vs :id/estimates
  // ordering concern noted further down, which is between two dynamic
  // routes).
  @Get()
  @ApiOperation({ summary: 'Browse verified artisans, optionally filtered by trade and pincode' })
  @ApiResponse({ status: 200, description: 'Page of public (bio-only) artisan profiles' })
  async search(@Query() query: SearchArtisansQueryDto) {
    return this.artisansService.searchPublic(query.page ?? 1, query.limit ?? 20, {
      tradeType: query.tradeType,
      pincode: query.pincode,
    });
  }

  @Post('me/profile')
  @Roles(Role.ARTISAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create your artisan profile',
    description: 'One-time. 409 if a profile already exists for this user.',
  })
  @ApiResponse({ status: 201, description: 'Artisan profile created' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  async onboard(@Req() req: any, @Body() dto: OnboardArtisanDto) {
    return this.artisansService.onboardProfile(req.user.sub, dto);
  }

  @Get('me/profile')
  @Roles(Role.ARTISAN)
  @ApiOperation({ summary: 'Read your own artisan profile' })
  @ApiResponse({ status: 200, description: 'The calling artisan profile' })
  @ApiResponse({ status: 404, description: 'No artisan profile for this user' })
  async getMe(@Req() req: any) {
    return this.artisansService.getOwnProfile(req.user.sub);
  }

  @Patch('me/profile')
  @Roles(Role.ARTISAN)
  @ApiOperation({ summary: 'Update your own artisan profile (partial)' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  async updateMe(@Req() req: any, @Body() dto: UpdateArtisanProfileDto) {
    return this.artisansService.updateProfile(req.user.sub, dto);
  }

  @Put('me/account-details')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Replace your bank account details',
    description: 'Update-or-create, full replace — not a partial patch.',
  })
  @ApiResponse({ status: 200, description: 'Updated account details' })
  async updateAccountDetails(@Req() req: any, @Body() dto: UpdateAccountDetailsDto) {
    return this.artisansService.upsertAccountDetails(req.user.sub, dto);
  }

  @Post('me/documents/upload-url')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Get a presigned upload URL for a document',
    description:
      "purpose 'lead' (default): your own KYC document, used with POST me/documents/confirm. " +
      "purpose 'team_member': a key for a team member's documentUrl — upload to it, then pass " +
      'the resulting key straight to POST/PATCH me/team — no confirm step for this purpose.',
  })
  @ApiResponse({ status: 200, description: 'Presigned POST url and fields' })
  async createUploadUrl(@Req() req: any, @Body() dto: CreateDocumentUploadUrlDto) {
    return this.artisansService.createUploadUrl(req.user.sub, dto.contentType, dto.purpose);
  }

  @Post('me/documents/confirm')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Confirm your KYC document upload',
    description: 'Called after the client uploads directly to S3 using the presigned URL.',
  })
  @ApiResponse({ status: 200, description: 'Profile with documentUrl now set' })
  @ApiResponse({ status: 400, description: "Key does not belong to this artisan's own upload" })
  async confirmDocumentUpload(@Req() req: any, @Body() dto: ConfirmDocumentUploadDto) {
    return this.artisansService.confirmDocumentUpload(req.user.sub, dto.key);
  }

  @Post('me/team')
  @Roles(Role.ARTISAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a crew member to your team' })
  @ApiResponse({ status: 201, description: 'Team member created' })
  async addTeamMember(@Req() req: any, @Body() dto: CreateTeamMemberDto) {
    return this.artisansService.addTeamMember(req.user.sub, dto);
  }

  @Patch('me/team/:memberId')
  @Roles(Role.ARTISAN)
  @ApiOperation({ summary: 'Update a team member' })
  @ApiResponse({ status: 200, description: 'Updated team member' })
  @ApiResponse({ status: 403, description: "Member does not belong to this artisan's profile" })
  async updateTeamMember(
    @Req() req: any,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.artisansService.updateTeamMember(req.user.sub, memberId, dto);
  }

  @Delete('me/team/:memberId')
  @Roles(Role.ARTISAN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a team member' })
  @ApiResponse({ status: 204, description: 'Removed' })
  async removeTeamMember(@Req() req: any, @Param('memberId', ParseUUIDPipe) memberId: string) {
    await this.artisansService.removeTeamMember(req.user.sub, memberId);
  }

  @Get('me/hire-requests')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Hire requests assigned to you',
    description:
      'Only requests the admin let through: PENDING_ADMIN_REVIEW and ADMIN_REJECTED never appear here. ' +
      'customerName/customerPhone are set while PENDING_ARTISAN_RESPONSE, ACCEPTED_BY_ARTISAN or IN_PROGRESS.',
  })
  @ApiResponse({ status: 200, description: 'Your hire requests, newest first' })
  async listMyHireRequests(@Req() req: any) {
    return this.hireRequestsService.listForArtisan(req.user.sub);
  }

  @Post('me/hire-requests/:id/estimates')
  @Roles(Role.ARTISAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a completion-time estimate for a hire request',
    description: 'Always appends a new row — never overwrites a prior estimate.',
  })
  @ApiResponse({ status: 201, description: 'The newly created estimate' })
  @ApiResponse({ status: 403, description: 'This hire request does not belong to you' })
  async addEstimate(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCompletionEstimateDto,
  ) {
    return this.hireRequestsService.addEstimate(req.user.sub, id, dto);
  }

  @Patch('me/hire-requests/:id/accept')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Accept a hire request the admin sent you',
    description:
      'PENDING_ARTISAN_RESPONSE -> ACCEPTED_BY_ARTISAN, within 48 hours of the admin allowing it (decision 0055).',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request, status ACCEPTED_BY_ARTISAN' })
  @ApiResponse({ status: 403, description: 'This hire request does not belong to you' })
  @ApiResponse({ status: 409, description: 'Not waiting on you, or the 48-hour window has passed' })
  async acceptHireRequest(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.hireRequestsService.acceptRequest(req.user.sub, id);
  }

  @Patch('me/hire-requests/:id/decline')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Decline a hire request the admin sent you',
    description:
      'PENDING_ARTISAN_RESPONSE -> ARTISAN_DECLINED, reason required, within 48 hours (decision 0055).',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request, status ARTISAN_DECLINED' })
  @ApiResponse({ status: 400, description: 'Missing reason' })
  @ApiResponse({ status: 403, description: 'This hire request does not belong to you' })
  @ApiResponse({ status: 409, description: 'Not waiting on you, or the 48-hour window has passed' })
  async declineHireRequest(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineHireRequestDto,
  ) {
    return this.hireRequestsService.declineRequest(req.user.sub, id, dto);
  }

  @Patch('me/hire-requests/:id/start')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Start work on an accepted hire request',
    description: 'ACCEPTED_BY_ARTISAN -> IN_PROGRESS. Only the owning artisan may call this.',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request, status IN_PROGRESS' })
  @ApiResponse({ status: 403, description: 'This hire request does not belong to you' })
  @ApiResponse({ status: 409, description: 'Request is not currently ACCEPTED_BY_ARTISAN' })
  async startWork(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.hireRequestsService.startWork(req.user.sub, id);
  }

  @Patch('me/hire-requests/:id/complete')
  @Roles(Role.ARTISAN)
  @ApiOperation({
    summary: 'Mark a hire request as completed',
    description: 'IN_PROGRESS -> COMPLETED. Only the owning artisan may call this.',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request, status COMPLETED' })
  @ApiResponse({ status: 403, description: 'This hire request does not belong to you' })
  @ApiResponse({ status: 409, description: 'Request is not currently IN_PROGRESS' })
  async completeWork(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.hireRequestsService.completeWork(req.user.sub, id);
  }

  // Shared action: owning customer, owning artisan, or admin. Ownership is
  // enforced in the service, not by @Roles() alone — same reasoning as
  // assertCanViewHireRequest below.
  @Patch('hire-requests/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a hire request',
    description:
      'Legal from PENDING_ADMIN_REVIEW, PENDING_ARTISAN_RESPONSE, ACCEPTED_BY_ARTISAN, or IN_PROGRESS. ' +
      'The artisan cannot cancel while PENDING_ARTISAN_RESPONSE — they decline instead. Terminal — no resume path.',
  })
  @ApiResponse({ status: 200, description: 'Updated hire request, status CANCELLED' })
  @ApiResponse({ status: 403, description: 'Not the owning customer, owning artisan, or admin' })
  @ApiResponse({ status: 409, description: 'Request is already completed or cancelled' })
  async cancelHireRequest(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelHireRequestDto,
  ) {
    return this.hireRequestsService.cancel(req.user.sub, req.user.role, id, dto);
  }

  // Customer-initiated routes. Hiring is customer-initiated, not
  // artisan-initiated (spec §8.1), so these are gated separately from the
  // ARTISAN-only routes above even though they live in the same
  // controller as the artisan-scoped and public routes.
  @Post('hire-requests')
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request to hire a verified artisan',
    description: '404 if the artisan does not exist or is not verified.',
  })
  @ApiResponse({ status: 201, description: 'Created with status PENDING_ADMIN_REVIEW' })
  async createHireRequest(@Req() req: any, @Body() dto: CreateHireRequestDto) {
    return this.hireRequestsService.createRequest(req.user.sub, dto);
  }

  @Get('hire-requests/mine')
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary: 'Your own hire requests',
    description: 'Includes every status, including PENDING_ADMIN_REVIEW and ADMIN_REJECTED.',
  })
  @ApiResponse({ status: 200, description: 'Your hire requests, newest first' })
  async listMyRequestsAsCustomer(@Req() req: any) {
    return this.hireRequestsService.listForCustomer(req.user.sub);
  }

  // Shared read: customer (owner), artisan (owner), or admin. Ownership is
  // enforced here, in the handler, not by @Roles() alone — a role proves
  // only who the caller is, never that they own this specific request
  // (LLD §6).
  @Get('hire-requests/:id/estimates')
  @ApiOperation({ summary: 'Full completion-estimate history for a hire request' })
  @ApiResponse({ status: 200, description: 'Estimates, oldest to newest' })
  @ApiResponse({ status: 403, description: 'Not the owning customer, owning artisan, or admin' })
  async getEstimateHistory(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const request = await this.hireRequestsService.getRequestById(id);
    await this.assertCanViewHireRequest(req.user.sub, req.user.role, request);
    return this.hireRequestsService.getEstimateHistory(id);
  }

  // Direct single-hire-request read, by id. Previously the only way to
  // get one request's full shape was to find it in a list response
  // (listMyHireRequests / listMyRequestsAsCustomer) — this closes that
  // gap for a detail screen that only has an id (e.g. from a
  // notification or a deep link). Same ownership rule as
  // getEstimateHistory/getAttributedOrders above. Registered before the
  // ':id/estimates' and ':id/orders' sub-resource routes below so this
  // bare ':id' never swallows those more specific paths — Nest/Express
  // match registration order for two dynamic segments at the same
  // position, unlike a static-vs-dynamic case where the static one
  // always wins regardless of order.
  @Get('hire-requests/:id')
  @ApiOperation({ summary: 'Read a single hire request by id' })
  @ApiResponse({ status: 200, description: 'The hire request' })
  @ApiResponse({ status: 403, description: 'Not the owning customer, owning artisan, or admin' })
  @ApiResponse({ status: 404, description: 'No such hire request' })
  async getHireRequestById(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const request = await this.hireRequestsService.getRequestById(id);
    await this.assertCanViewHireRequest(req.user.sub, req.user.role, request);
    return this.hireRequestsService.mapToHireRequestDto(request);
  }

  // Decision 0045 item 7: the orders a customer placed while attributing
  // to this engagement. Same ownership rule as getEstimateHistory above.
  @Get('hire-requests/:id/orders')
  @ApiOperation({ summary: 'Orders attributed to this hire request' })
  @ApiResponse({ status: 200, description: 'Orders, newest first' })
  @ApiResponse({ status: 403, description: 'Not the owning customer, owning artisan, or admin' })
  async getAttributedOrders(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const request = await this.hireRequestsService.getRequestById(id);
    await this.assertCanViewHireRequest(req.user.sub, req.user.role, request);
    return this.hireRequestsService.listAttributedOrders(id);
  }

  // Public read: any authenticated role may view a verified artisan's
  // public (bio-only) profile. 404 for both "doesn't exist" and "not
  // verified" — indistinguishable on purpose (spec §5).
  @Get(':id/public')
  @ApiOperation({ summary: "A verified artisan's public, bio-only profile" })
  @ApiResponse({ status: 200, description: 'Public profile' })
  @ApiResponse({ status: 404, description: 'Not found, or not verified' })
  async getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.artisansService.getPublicProfile(id);
  }

  private async assertCanViewHireRequest(
    userId: string,
    role: string,
    request: {
      customerId: string;
      artisanId: string;
      status: string;
      adminReviewedAt: Date | null;
    },
  ): Promise<void> {
    if (role === Role.ADMIN) {
      return;
    }
    if (role === Role.CUSTOMER && request.customerId === userId) {
      return;
    }
    if (role === Role.ARTISAN) {
      // Same admin-gate boundary as listForArtisan: an artisan only sees a
      // request the admin let through, so they can't confirm one exists
      // via this read while it's in admin review, was blocked, or was
      // cancelled before the admin reviewed it.
      if (!isVisibleToArtisan(request)) {
        throw new ForbiddenException('you may not view this hire request');
      }
      const artisan = await this.artisansService.resolveArtisanByUserId(userId).catch(() => null);
      if (artisan && artisan.id === request.artisanId) {
        return;
      }
    }
    throw new ForbiddenException('you may not view this hire request');
  }
}
