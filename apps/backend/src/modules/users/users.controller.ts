import {
  Body,
  Controller,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload, Role } from '@golden-abode/types';
import { UpdateDeviceTokenDto } from './dto/update-device-token.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me/device-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the push token for this device (any authenticated role)' })
  @ApiResponse({ status: 200, description: 'Device token saved' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  async updateDeviceToken(@CurrentUser() user: JwtPayload, @Body() dto: UpdateDeviceTokenDto) {
    await this.usersService.updateDeviceToken(user.sub, dto.deviceToken);
    return { success: true };
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a Vendor or Artisan (Admin Only)' })
  @ApiResponse({ status: 200, description: 'User approved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async approveUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersService.approveUser(id);
    return { success: true, message: 'User approved successfully' };
  }
}
