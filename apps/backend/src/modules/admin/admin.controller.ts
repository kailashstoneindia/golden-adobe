import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import { SetUserActiveDto } from './dto/set-user-active.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard counts for pending approvals and users' })
  getStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Paginated user list with filters' })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'User detail for admin review' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUser(@Param('id', ParseUUIDPipe) userId: string) {
    return this.adminService.getUserById(userId);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Fix the name, email or phone of a user',
    description: 'Only these three fields. 409 if the phone or email belongs to another account.',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Phone or email already in use' })
  updateUser(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminService.updateUser(userId, adminUserId, dto);
  }

  @Patch('users/:id/active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate or reactivate a user',
    description: 'Deactivating also signs the user out everywhere. You cannot deactivate yourself.',
  })
  setUserActive(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: SetUserActiveDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminService.setUserActive(userId, adminUserId, dto.isActive);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign a user out of every device' })
  revokeSessions(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminService.revokeUserSessions(userId, adminUserId);
  }

  @Patch('users/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a pending vendor or artisan',
    description:
      'For an ustaad this runs Verify (decision 0058): 400 if they have no profile or no document.',
  })
  approveUser(@Param('id', ParseUUIDPipe) userId: string, @CurrentUser('sub') adminUserId: string) {
    return this.adminService.approveUser(userId, adminUserId);
  }

  @Patch('users/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject or revoke approval for vendor or artisan' })
  rejectUser(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() rejectUserDto: RejectUserDto,
    @CurrentUser('sub') adminUserId: string,
  ) {
    return this.adminService.rejectUser(userId, adminUserId, rejectUserDto.reason);
  }
}
