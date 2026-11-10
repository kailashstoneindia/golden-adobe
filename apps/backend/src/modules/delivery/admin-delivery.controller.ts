import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@golden-abode/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliveryAssignmentsService } from './delivery-assignments.service';
import { QueueQueryDto } from './dto/delivery-assignment.dto';

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
}
