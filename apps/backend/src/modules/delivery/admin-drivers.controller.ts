import {
  Body,
  Controller,
  Get,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DriversService } from './drivers.service';
import { CreateDriverDto, ListDriversQueryDto, UpdateDriverDto } from './dto/driver.dto';

@ApiTags('Admin delivery')
@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminDriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a driver account',
    description:
      'Creates the DRIVER user and driver profile. The driver then logs in with phone OTP.',
  })
  @ApiResponse({ status: 409, description: 'Phone or vehicle already in use' })
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Paginated driver list' })
  list(@Query() query: ListDriversQueryDto) {
    return this.driversService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One driver with vehicle and document links' })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.driversService.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a driver',
    description:
      'Name, phone, licence number, helper and vehicle. Use PATCH /admin/users/:id/active to deactivate.',
  })
  @ApiResponse({ status: 404, description: 'Driver not found' })
  @ApiResponse({ status: 409, description: 'Phone or vehicle already in use' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }
}
