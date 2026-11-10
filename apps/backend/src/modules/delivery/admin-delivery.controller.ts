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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { AssignDeliveryDto, DriverIdDto, QueueQueryDto } from './dto/delivery-assignment.dto';

@ApiTags('Admin delivery')
@Controller('admin/delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminDeliveryController {
  constructor(private readonly assignments: DeliveryAssignmentsService) {}

  @Get('queue')
  @ApiOperation({ summary: 'Ready-for-pickup groups with nobody assigned, oldest first' })
  queue(@Query() query: QueueQueryDto) {
    return this.assignments.listQueue(query);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Assign a driver to a ready-for-pickup group' })
  @ApiResponse({ status: 400, description: 'Group not ready, driver inactive, or order locked' })
  @ApiResponse({ status: 409, description: 'Group already has an open assignment' })
  assign(@CurrentUser('sub') adminUserId: string, @Body() dto: AssignDeliveryDto) {
    return this.assignments.assign(adminUserId, dto);
  }

  @Post('assignments/:id/reassign')
  @ApiOperation({ summary: 'Give an assigned (not yet picked up) job to another driver' })
  reassign(
    @CurrentUser('sub') adminUserId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DriverIdDto,
  ) {
    return this.assignments.reassign(adminUserId, id, dto.driverId);
  }

  @Post('groups/:groupId/reattempt')
  @ApiOperation({
    summary: 'Send a failed delivery out again with a chosen driver',
    description: 'The goods are assumed still on the truck, so the new attempt starts picked up.',
  })
  @ApiResponse({ status: 400, description: 'Group is not in delivery_failed, or order locked' })
  reattempt(
    @CurrentUser('sub') adminUserId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: DriverIdDto,
  ) {
    return this.assignments.reattempt(adminUserId, groupId, dto.driverId);
  }
}
