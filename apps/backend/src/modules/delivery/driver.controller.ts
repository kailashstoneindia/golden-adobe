import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DriverDeliveriesService } from './driver-deliveries.service';
import {
  CompleteDeliveryDto,
  DeliveryPhotoUrlDto,
  DriverJobsQueryDto,
  FailDeliveryDto,
  PickupDto,
} from './dto/driver-delivery.dto';

// Decision 0060. The driver app. `:id` is always the assignment id; an
// assignment that belongs to another driver is a 404.
@ApiTags('Driver')
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
@ApiBearerAuth()
export class DriverController {
  constructor(private readonly deliveries: DriverDeliveriesService) {}

  @Get('me')
  @ApiOperation({ summary: 'The logged-in driver with helper and vehicle' })
  me(@CurrentUser('sub') userId: string) {
    return this.deliveries.getProfile(userId);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'My jobs: active (assigned, picked up) or history (delivered, failed)' })
  list(@CurrentUser('sub') userId: string, @Query() query: DriverJobsQueryDto) {
    return this.deliveries.list(userId, query.scope ?? 'active');
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'One job' })
  get(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.get(userId, id);
  }

  @Post('deliveries/:id/pickup')
  @ApiOperation({ summary: 'Confirm every item is loaded and leave the vendor' })
  pickup(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PickupDto,
  ) {
    return this.deliveries.pickup(userId, id, dto.items);
  }

  @Post('deliveries/:id/photo-url')
  @ApiOperation({ summary: 'Presigned upload for the delivered or failed proof photo' })
  photoUrl(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliveryPhotoUrlDto,
  ) {
    return this.deliveries.createPhotoUrl(userId, id, dto.kind, dto.contentType);
  }

  @Post('deliveries/:id/complete')
  @ApiOperation({
    summary: 'Finish the delivery with the customer code and a photo',
    description: 'A wrong code is a 400; the 5th wrong try is a 403 and locks the job for ops.',
  })
  complete(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.deliveries.complete(userId, id, dto.otp, dto.photoKey);
  }

  @Post('deliveries/:id/fail')
  @ApiOperation({ summary: 'Report a failed attempt with a reason and a photo' })
  fail(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FailDeliveryDto,
  ) {
    return this.deliveries.fail(userId, id, dto.reason, dto.note, dto.photoKey);
  }
}
