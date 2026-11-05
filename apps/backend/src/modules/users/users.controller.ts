import { Body, Controller, Patch, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '@golden-abode/types';
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
}
